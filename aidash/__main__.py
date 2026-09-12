"""Run with python3 -m aidash. No third-party dependencies required."""

import argparse
import fcntl
import json
import os
import sys
from datetime import date, timedelta

from .http import archived_fetch
from .report import month_bounds, write_exports
from .store import Store


def positive(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def refresh(store, args):
    from .sources.science import discover
    from .sources.structured import fetch_fda, fetch_indeed
    from .sources.trials import refresh_trials
    from .sources.math_news import refresh_math_news
    from .sources.context import fetch_macro, fetch_supply, validate_snapshot
    from .sources.activity import fetch_us, fetch_taiwan, company_rows, archive_company_catalog, validate_activity

    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    if start > end:
        raise ValueError("Start date must be before or equal to end date")
    results = []
    failed = False
    activity_sources = ["activity-us", "activity-taiwan", "activity-companies", "activity-energy", "activity-trade"]
    sources = (["indeed", "macro", "supply-chain", *activity_sources, "fda", "trials", "math-news"] if args.source == "all" else activity_sources if args.source == "activity" else [args.source])
    for source in sources:
        run_id = store.start_run(source)
        fetch = archived_fetch(store, run_id)
        try:
            if source.startswith("activity-"):
                if source == "activity-companies":
                    archive_company_catalog(store, run_id)
                    observations = company_rows()
                elif source == "activity-energy":
                    from .sources.activity import fetch_energy
                    observations = fetch_energy(fetch)
                elif source == "activity-trade":
                    from .sources.trade import fetch_trade
                    observations = fetch_trade(fetch)
                else:
                    observations = {"activity-us": fetch_us, "activity-taiwan": fetch_taiwan}[source](fetch)
                validate_activity(store, source, observations)
                details = store.ingest_observations(source, observations, run_id)
                if source == "activity-companies":
                    details["refresh_mode"] = "Imported reviewed catalog; new filings require catalog review"
                status = "success"
            elif source == "math-news":
                details = refresh_math_news(store, fetch, start.isoformat(), end.isoformat())
                status = "success"
            elif source == "trials":
                details = refresh_trials(store, fetch)
                status = "success"
            elif source == "science":
                batch = discover(fetch, start.isoformat(), end.isoformat(), max_pages=args.max_pages, page_size=args.page_size)
                stats = store.ingest_documents(batch["documents"], run_id)
                details = {k: v for k, v in batch.items() if k != "documents"}
                details.update(stats)
                status = "success" if batch["complete"] else "partial"
            else:
                observations = {"indeed": fetch_indeed, "fda": fetch_fda, "macro": fetch_macro, "supply-chain": fetch_supply}[source](fetch)
                if source in ("macro", "supply-chain"):
                    validate_snapshot(store, source, observations)
                details = store.ingest_observations(source, observations, run_id)
                status = "success"
            store.finish_run(run_id, status, details)
            results.append({"source": source, "status": status, **details})
            failed = failed or status != "success"
        except Exception as error:
            store.finish_run(run_id, "failed", {"error": str(error)})
            results.append({"source": source, "status": "failed", "error": str(error)})
            failed = True
    print(json.dumps(results, indent=2))
    return 1 if failed else 0


def candidates(store, limit):
    result = []
    for row in store.documents():
        review = store.latest_review(row["id"])
        if review and review["content_hash"] == row["content_hash"]:
            continue
        document = json.loads(row["payload"])
        extraction = store.db.execute("""SELECT * FROM extractions WHERE document_id=? AND content_hash=?
            ORDER BY created_at DESC LIMIT 1""", (row["id"], row["content_hash"])).fetchone()
        result.append({"id": row["id"], "title": document["title"], "published_at": document["published_at"],
                       "url": document["url"], "status": "needs_rereview" if review else "unreviewed",
                       "extraction": json.loads(extraction["payload"]) if extraction else None})
        if len(result) == limit:
            break
    print(json.dumps(result, indent=2, ensure_ascii=False))


def extract_candidates(store, args):
    from .extraction import DEFAULT_MODEL, PROMPT_VERSION, extract

    api_key = os.environ.get("OPENROUTER_API_KEY")
    model = args.model or os.environ.get("OPENROUTER_MODEL") or DEFAULT_MODEL
    if not api_key:
        raise ValueError("Extraction requires OPENROUTER_API_KEY. Discovery does not need a key.")
    completed = []
    for row in store.documents():
        document = json.loads(row["payload"])
        if not document.get("abstract"):
            continue
        review = store.latest_review(row["id"])
        if review and review["content_hash"] == row["content_hash"]:
            continue
        exists = store.db.execute("""SELECT 1 FROM extractions WHERE document_id=? AND content_hash=?
            AND model=? AND prompt_version=?""", (row["id"], row["content_hash"], model, PROMPT_VERSION)).fetchone()
        if exists:
            continue
        result = extract(document, model, api_key)
        store.save_extraction(row, model, PROMPT_VERSION, result)
        completed.append({"id": row["id"], "is_candidate": result["is_candidate"]})
        if len(completed) >= args.limit:
            break
    print(json.dumps({"provider": "openrouter", "model": model, "prompt_version": PROMPT_VERSION, "extracted": completed,
                      "publication": "Review required; nothing was automatically published."}, indent=2))


def parser():
    cli = argparse.ArgumentParser(description="AI & Society ingestion and shared monthly exports")
    cli.add_argument("--data-dir", default="data", help="Persistent state directory (default: data)")
    commands = cli.add_subparsers(dest="command", required=True)
    job = commands.add_parser("refresh", help="Refresh metrics and registered drug trials; optionally search papers")
    job.add_argument("--source", choices=["all", "indeed", "macro", "supply-chain", "activity", "activity-us", "activity-taiwan", "activity-companies", "activity-energy", "activity-trade", "fda", "trials", "math-news", "science"], default="all")
    job.add_argument("--from", dest="start", default=(date.today() - timedelta(days=90)).isoformat())
    job.add_argument("--to", dest="end", default=date.today().isoformat())
    job.add_argument("--max-pages", type=positive, default=2)
    job.add_argument("--page-size", type=positive, default=100)
    queue = commands.add_parser("candidates", help="List the editorial review queue")
    queue.add_argument("--limit", type=positive, default=20)
    extraction = commands.add_parser("extract", help="Optional paid LLM extraction; never publishes entries")
    extraction.add_argument("--model", help="OpenRouter model ID; overrides OPENROUTER_MODEL (default: openai/gpt-4.1-mini)")
    extraction.add_argument("--limit", type=positive, default=5)
    review = commands.add_parser("review", help="Record a publish/reject decision against current source content")
    review.add_argument("document_id")
    review.add_argument("--decision", choices=["publish", "reject"], required=True)
    review.add_argument("--notes", required=True)
    review.add_argument("--event-date")
    review.add_argument("--summary")
    review.add_argument("--discipline", choices=["biology", "medicine", "chemistry", "physics", "mathematics", "earth_science", "other"])
    review.add_argument("--evidence-stage", choices=["reported", "experimentally_tested", "independently_validated", "deployed"])
    review.add_argument("--evidence-url")
    export = commands.add_parser("export", help="Write shared monthly JSON and all current time series")
    export.add_argument("--month", default=date.today().strftime("%Y-%m"))
    commands.add_parser("status", help="Show recent ingestion runs")
    dashboard = commands.add_parser("build-dashboard", help="Prepare data for the local read-only dashboard")
    dashboard.add_argument("--output", default="dist/data")
    return cli


def main():
    args = parser().parse_args()
    store = Store(args.data_dir)
    # A single writer protects raw files and ingestion/review transactions on reruns.
    with (store.root / ".pipeline.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Another pipeline command is running in this data directory.", file=sys.stderr)
            return 1
        try:
            if args.command == "refresh":
                return refresh(store, args)
            if args.command == "candidates":
                candidates(store, args.limit)
            elif args.command == "extract":
                extract_candidates(store, args)
            elif args.command == "review":
                fields = ("notes", "event_date", "summary", "discipline", "evidence_stage", "evidence_url")
                store.review(args.document_id, args.decision, {field: getattr(args, field) for field in fields})
                print(json.dumps({"id": args.document_id, "decision": args.decision}))
            elif args.command == "export":
                month_bounds(args.month)
                print(write_exports(store, args.month))
            elif args.command == "status":
                rows = [dict(row) for row in store.db.execute("SELECT * FROM runs ORDER BY id DESC LIMIT 20")]
                for row in rows:
                    row["details"] = json.loads(row["details"])
                print(json.dumps(rows, indent=2))
            elif args.command == "build-dashboard":
                from .dashboard import build_dashboard
                print(build_dashboard(store, args.output))
            return 0
        except (ValueError, RuntimeError) as error:
            print(str(error), file=sys.stderr)
            return 1
        finally:
            store.db.close()


if __name__ == "__main__":
    sys.exit(main())
