"""Publish a small, explicit read-only view of pipeline output to the local UI."""

import json
from pathlib import Path

from .report import monthly_report
from .store import now
from .sources.trials import dashboard_trials
from .sources.math_news import load_math_results
from .sources.context import macro_spec, SUPPLY
from .sources.activity import catalog
from .sources.leading import dashboard_leading

COUNTRIES = {"US": "United States", "GB": "United Kingdom", "CA": "Canada", "AU": "Australia",
             "DE": "Germany", "FR": "France", "IE": "Ireland", "IT": "Italy", "NL": "Netherlands"}


def build_dashboard(store, output="dist/data"):
    jobs, health, macro, supply = {}, [], {}, {}
    for row in store.db.execute("SELECT payload FROM observations WHERE active=1"):
        item = json.loads(row[0])
        if item["source"] == "indeed":
            country = item["geography"]
            jobs.setdefault(country, {"name": COUNTRIES.get(country, country), "points": []})
            jobs[country]["points"].append([item["period"], item["value"]])
        elif item["source"] == "fda":
            health.append({"date": item["period"], "value": item["value"], "specialty": item["dimensions"].get("specialty")})
        elif item["source"].startswith("activity-"):
            series = supply.setdefault(item["metric"], {**item["metadata"], "points": [], "evidence": {}})
            series["points"].append([item["period"], item["value"]])
            series["evidence"][item["period"]] = item.get("evidence", {"url": item["url"]})
        elif item["source"] in ("macro", "supply-chain"):
            metric, country = item["metric"], item["geography"]
            collection = macro.setdefault(country, {}) if item["source"] == "macro" else supply
            meta = macro_spec(metric, country) if item["source"] == "macro" else SUPPLY[metric]
            collection.setdefault(metric, {**meta, "points": []})["points"].append([item["period"], item["value"]])
    for series in jobs.values():
        series["points"].sort(key=lambda point: point[0])
    for series in [*supply.values(), *(series for country in macro.values() for series in country.values())]:
        series["points"].sort(key=lambda point: point[0])
    health.sort(key=lambda point: (point["date"], point["specialty"] or ""))
    available = sorted(path.stem for path in (store.root / "public").glob("????-??.json"))
    if not available:
        raise ValueError("Export at least one month before building the dashboard")
    default_month = available[-1]
    papers = []
    for row in store.documents():
        review = store.latest_review(row["id"])
        if review and review["content_hash"] == row["content_hash"]:
            # Reviewed entries live in the milestone list; rejected papers stay internal.
            continue
        document = json.loads(row["payload"])
        extraction = store.db.execute("""SELECT payload FROM extractions WHERE document_id=? AND content_hash=?
            ORDER BY created_at DESC LIMIT 1""", (row["id"], row["content_hash"])).fetchone()
        draft = json.loads(extraction[0]) if extraction else None
        if draft and not draft["is_candidate"]:
            continue
        papers.append({"id": row["id"], "title": document["title"], "url": document["url"],
                       "date": document["published_at"], "journal": document.get("metadata", {}).get("journal") or "Research paper",
                       "publication_types": document.get("metadata", {}).get("publication_types", []),
                       "status": "needs_rereview" if review else "unreviewed",
                       "draft": {key: draft[key] for key in ("summary", "ai_contribution", "evidence_stage", "limitations")} if draft else None})
    reports = {}
    for month in available:
        report = monthly_report(store, month)
        reports[month] = {"month": month, "milestones": report["milestones"]}
    payload = {"generated_at": now(), "default_month": default_month,
               "reports": reports,
               "jobs": jobs, "macro": {country: {metric: series[metric] for metric in ("postings", "employment", "unemployment", "participation", "openings", "earnings", "quits", "layoffs") if metric in series} for country, series in macro.items()},
               "supply_chain": {metric: supply[metric] for metric in [*SUPPLY, *sorted(set(supply) - set(SUPPLY))] if metric in supply}, "health": health, "papers": papers,
               "euv": {key: value for key, value in catalog("company-activity").items() if key != "series"},
               "trade": catalog("trade-activity"),
               "research_discovery_count": len(store.documents()),
               "trials": dashboard_trials(store),
               "math_news": load_math_results()}
    payload["leading_indicators"] = dashboard_leading(store, payload)
    target = Path(output)
    target.mkdir(parents=True, exist_ok=True)
    path = target / "dashboard.json"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)
    return path
