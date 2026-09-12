"""Shared calendar-month exports. No visitor or account state."""

import calendar
import json
import re
from collections import defaultdict
from datetime import date, timedelta

from .store import encoded, now


def month_bounds(month):
    start = date.fromisoformat(month + "-01")
    end = date(start.year, start.month, calendar.monthrange(start.year, start.month)[1])
    return start.isoformat(), end.isoformat()


def monthly_report(store, month):
    from .sources.structured import SOURCE_METADATA
    from .sources.science import SCOPE, SEARCH_URL
    from .sources.context import MACRO, SUPPLY
    start, end = month_bounds(month)
    previous_month = (date.fromisoformat(start) - timedelta(days=1)).strftime("%Y-%m")
    groups = defaultdict(list)
    for row in store.db.execute("SELECT payload FROM observations WHERE active=1"):
        item = json.loads(row[0])
        if item["period"] <= end:
            key = encoded({k: item[k] for k in ("source", "metric", "geography", "dimensions")})
            groups[key].append(item)
    metrics = []
    for key, values in sorted(groups.items()):
        values.sort(key=lambda x: x["period"])
        latest = values[-1]
        prior = [v for v in values if v["period"].startswith(previous_month + "-")]
        previous = prior[-1] if prior else None
        in_month = latest["period"] >= start
        metrics.append({**json.loads(key), "unit": latest["unit"], "frequency": latest["frequency"],
                        "latest": {k: latest[k] for k in ("period", "value", "url")},
                        "has_observation_this_month": in_month,
                        "previous": {k: previous[k] for k in ("period", "value")} if previous else None,
                        "change": latest["value"] - previous["value"] if previous and in_month else None,
                        "comparison": "Last available observation in each of two adjacent calendar months; not monthly averages.",
                        "change_unit": "percentage_points" if latest["unit"] == "percent" else latest["unit"]})
    runs = []
    for row in store.db.execute("SELECT * FROM runs WHERE id IN (SELECT MAX(id) FROM runs GROUP BY source) ORDER BY source"):
        runs.append({**dict(row), "details": json.loads(row["details"])})
    return {"month": month, "title": "What happened in " + date.fromisoformat(start).strftime("%B %Y"),
            "generated_at": now(), "data_vintage": "Latest ingested source versions; historical releases may be revised.",
            "metrics": metrics, "milestones": store.public_milestones(month), "source_runs": runs,
            "sources": {**SOURCE_METADATA,
                        "macro": {"name": "Indeed, BLS and OECD via FRED", "series": MACRO, "measurement": "Labor-market context; not AI-attributed employment effects."},
                        "supply-chain": {"name": "Fed, BLS, IMF, CSO and Eurostat", "series": SUPPLY, "measurement": "Industry indicators and surveyed AI use. Measures overlap and cannot form an additive AI total."},
                        "activity-us": {"name": "U.S. Census via FRED", "measurement": "Monthly nominal manufacturing orders, shipments, inventories and backlog; broad computer/electronics industry."},
                        "activity-taiwan": {"name": "Taiwan MOEA", "measurement": "Monthly production volume indexes and broader-industry production, shipment and inventory values. Not seasonally adjusted."},
                        "activity-energy": {"name": "U.S. EIA", "measurement": "Monthly utility-scale generation and electricity sales in TWh; not AI-attributed consumption."},
                        "activity-companies": {"name": "Reviewed company filings", "measurement": "Curated, source-linked supplier and foundry histories. Refresh imports reviewed values; it does not discover or approve new filings."},
                        "activity-trade": {"name": "UN Comtrade", "measurement": "Selected bilateral annual exports, FOB USD. Coverage varies by reporter/year; missing routes are not zero. HS classes include non-AI activity and do not isolate EUV."},
                        "science": {"name": "Europe PMC", "url": SEARCH_URL, "scope": SCOPE,
                        "measurement": "Search results are unreviewed research candidates, not a census of discoveries."}},
            "coverage_note": "Science discovery initially screens AI protein and drug discovery. An empty milestone list means no reviewed entries, not no discoveries."}


def write_exports(store, month):
    month_bounds(month)
    series = [json.loads(row[0]) for row in store.db.execute("SELECT payload FROM observations WHERE active=1 ORDER BY source,id")]
    output = store.root / "public"
    output.mkdir(parents=True, exist_ok=True)
    # These are current-vintage views, so corrections must reach older exports too.
    months = {month}
    months.update(path.stem for path in output.glob("*.json") if re.fullmatch(r"\d{4}-\d{2}", path.stem))
    files = [(item + ".json", monthly_report(store, item)) for item in sorted(months)]
    files.append(("series.json", series))
    for name, payload in files:
        path = output / name
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
        temporary.replace(path)
    return output / (month + ".json")
