"""Measured industry activity. Official feeds and explicitly curated filings.

Snapshots are independent by source, so an unavailable trade feed cannot erase
production history. Values retain their original scope and measurement units.
"""

import csv
import hashlib
import io
import json
import re
from datetime import date
from pathlib import Path

from .context import fred_spec, fred_url, parse_fred, observation, month_end
from .structured import SourceSchemaError

CATALOGS = Path(__file__).resolve().parents[1] / "catalogs"


def catalog(name):
    return json.loads((CATALOGS / (name + ".json")).read_text(encoding="utf-8"))


US = {
    "us_electronics_orders": fred_spec("A34SNO", "Computer & electronic product new orders", "usd_mn", "US", "Census manufacturers' orders, nominal USD millions, seasonally adjusted. Excludes semiconductor new orders, which are not collected. Includes non-AI demand.", measure="Orders"),
    "us_electronics_shipments": fred_spec("A34SVS", "Computer & electronic product shipments", "usd_mn", "US", "Census manufacturers' shipment value, nominal USD millions, seasonally adjusted. Includes semiconductors and non-AI products; monetary value is not physical unit volume.", measure="Shipments"),
    "us_electronics_inventory": fred_spec("A34STI", "Computer & electronic product inventories", "usd_mn", "US", "Census manufacturers' end-period inventory value, nominal USD millions, seasonally adjusted. A stock, not a monthly flow; includes non-AI products.", measure="Inventories"),
    "us_electronics_backlog": fred_spec("A34SUO", "Computer & electronic product unfilled orders", "usd_mn", "US", "Census manufacturers' end-period unfilled orders, nominal USD millions, seasonally adjusted. Excludes semiconductor orders. Backlog is a stock and cannot be added to new orders.", measure="Backlog"),
}
for meta in US.values():
    meta.update(group="activity", stage="Computers and electronics", unit_label="Nominal USD millions · seasonally adjusted", source_name="U.S. Census / FRED", geography_name="United States", coordinates=[-98, 39], refresh_mode="Official feed")


def attach(rows, definitions):
    for row in rows:
        row["metadata"] = definitions[row["metric"]]
    return rows


def fetch_us(fetch):
    rows = []
    # FRED sends a ZIP for mixed monthly-flow/end-period-stock frequencies.
    # Request the two homogeneous groups as strict CSVs instead.
    for keys in (("us_electronics_orders", "us_electronics_shipments"), ("us_electronics_inventory", "us_electronics_backlog")):
        definitions = {US[key]["fred_id"]: (key, US[key]) for key in keys}
        url = fred_url(definitions)
        rows.extend(parse_fred(fetch(url), definitions, "activity-us", url))
    return attach(rows, US)


def taiwan_meta(item):
    volume = item["metric_type"] == "production_index"
    return dict(name=item["name"], stage=item["stage"], group="activity", geography="TW", geography_name="Taiwan", coordinates=[121, 23.7], frequency="monthly", unit="index" if volume else "twd_thousands", unit_label="Production volume index · 2021=100 · not seasonally adjusted" if volume else "Nominal TWD thousands · not seasonally adjusted", measure={"production_index": "Production", "production_value": "Production value", "shipments_value": "Shipments", "inventory_value": "Inventories"}[item["metric_type"]], url=item["source_url"], source_name="Taiwan MOEA", note=item["evidence_notes"], refresh_mode="Official feed", industry_code=item["industry_code"])


def parse_taiwan(raw, items):
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    volume = items[0]["metric_type"] == "production_index"
    value_key = "統計值(指數)" if volume else "統計值(金額)"
    expected = {"統計項目", "行業別", "資料期(民國年)", value_key, "計量單位"} | ({"行業代碼"} if volume else set())
    if set(reader.fieldnames or []) != expected:
        raise SourceSchemaError("MOEA CSV columns changed")
    native = {"production_index": "生產指數", "production_value": "生產價值", "shipments_value": "銷售價值", "inventory_value": "存貨價值"}
    rows, seen = [], set()
    for record in reader:
        if None in record or any(v is None for v in record.values()):
            raise SourceSchemaError("Malformed MOEA row")
        for item in items:
            matches = record["行業代碼"].strip() == item["industry_code"] if volume else record["行業別"].strip() == item["native_industry_name"]
            if not matches or record["統計項目"].strip() != native[item["metric_type"]]:
                continue
            if record["計量單位"].strip() != item["source_unit"]:
                raise SourceSchemaError("MOEA unit or index base changed")
            period = record["資料期(民國年)"].strip()
            if not re.fullmatch(r"\d{5}", period):
                raise SourceSchemaError("Unexpected MOEA monthly period")
            day = month_end(int(period[:3]) + 1911, int(period[3:]))
            if day < "2019-01-01":
                continue
            key = item["id"], day
            if key in seen:
                raise SourceSchemaError("Duplicate MOEA month")
            seen.add(key)
            value = record[value_key].strip()
            if value in ("", "-", "--", "...", "NA", "N/A"):
                continue
            meta = taiwan_meta(item)
            row = observation("activity-taiwan", item["id"], meta, day, value.replace(",", ""), item["data_url"])
            row["metadata"] = meta
            rows.append(row)
    if {row["metric"] for row in rows} != {item["id"] for item in items}:
        raise SourceSchemaError("Missing MOEA industry series")
    return rows


def fetch_taiwan(fetch):
    items = catalog("taiwan-activity")["metrics"]
    rows = []
    for url in dict.fromkeys(item["data_url"] for item in items):
        rows.extend(parse_taiwan(fetch(url), [item for item in items if item["data_url"] == url]))
    return rows


def parse_energy(raw):
    items = catalog("energy-activity")["metrics"]
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    if set(reader.fieldnames or []) != {"MSN", "YYYYMM", "Value", "Column_Order", "Description", "Unit"}:
        raise SourceSchemaError("EIA table columns changed")
    definitions = {item["series_id"]: item for item in items}
    rows, seen = [], set()
    for record in reader:
        if None in record or any(v is None for v in record.values()):
            raise SourceSchemaError("Malformed EIA row")
        item = definitions.get(record["MSN"])
        if not item:
            continue
        period = record["YYYYMM"]
        if not re.fullmatch(r"\d{6}", period):
            raise SourceSchemaError("Unexpected EIA period")
        if period[4:] == "13" or period < "201901":
            continue
        if record["Unit"] != "Billion Kilowatthours":
            raise SourceSchemaError("EIA units changed")
        day = month_end(int(period[:4]), int(period[4:]))
        key = item["id"], day
        if key in seen:
            raise SourceSchemaError("Duplicate EIA month")
        seen.add(key)
        if record["Value"] in ("Not Available", "Not Applicable", "NA", ""):
            continue
        meta = dict(name=item["name"], stage="Electricity", group="activity", geography="US", geography_name="United States", coordinates=[-98, 39], frequency="monthly", unit="twh", unit_label="TWh · not seasonally adjusted", measure="Electricity", source_name="U.S. EIA", url=item["source_url"], refresh_mode="Official feed", note="U.S. electricity across all users and industries, including non-AI consumption. Generation covers utility-scale facilities and excludes small-scale solar; sales exclude direct self-use. Values are monthly totals; no seasonal adjustment.")
        row = observation("activity-energy", item["id"], meta, day, record["Value"], item["data_url"])
        row["metadata"] = meta
        rows.append(row)
    if {r["metric"] for r in rows} != {i["id"] for i in items}:
        raise SourceSchemaError("Missing EIA series")
    return rows


def fetch_energy(fetch):
    return parse_energy(fetch(catalog("energy-activity")["metrics"][0]["data_url"]))


def company_rows():
    data = catalog("company-activity")
    rows = []
    units = {"EUR million": "eur_mn", "CHF million": "chf_mn", "USD billion": "usd_bn", "systems": "systems", "FTE": "fte", "thousand 12-inch-equivalent wafers": "thousand_wafers"}
    for item in data["series"]:
        meta = dict(name=item["title"], stage=item["component"], group="activity" if item["company"] == "TSMC" else "euv", company=item["company"], geography="Company worldwide", geography_name="Company worldwide", frequency=item["frequency"].split(",")[0], period_basis=item["frequency"], unit=units[item["unit"]], unit_label=item["unit"] + " · " + item["frequency"], measure="Investment" if "capex" in item["id"] else "Physical shipments" if "wafers" in item["id"] else "Company filings", url=item["points"][-1]["source_url"], note=item["scope"], source_name=item["company"] + " filings", refresh_mode="Curated filings", reviewed_at=data["reviewed_at"])
        for point in item["points"]:
            row = observation("activity-companies", item["id"], meta, point["date"], point["value"], point["source_url"])
            row["metadata"] = meta
            row["evidence"] = data["sources"][point["source_id"]]
            rows.append(row)
    return rows


def archive_company_catalog(store, run_id):
    """Archive the reviewed input, without claiming to have fetched new filings."""
    body = (CATALOGS / "company-activity.json").read_bytes()
    digest = hashlib.sha256(body).hexdigest()
    path = store.root / "raw" / (digest + ".blob")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    store.record_fetch(run_id, "catalog:reviewed-company-activity", digest, str(path.relative_to(store.root)))


def validate_activity(store, source, rows):
    if not rows:
        raise SourceSchemaError("Empty activity snapshot")
    groups = {}
    for row in rows:
        key = row["metric"], row["geography"]
        periods = groups.setdefault(key, set())
        if row["period"] in periods:
            raise SourceSchemaError("Duplicate activity period")
        periods.add(row["period"])
    for row in rows:
        minimum = 24 if row["frequency"] == "monthly" else 4 if row["frequency"] == "quarterly" else 2
        if source != "activity-trade" and len(groups[(row["metric"], row["geography"])]) < minimum:
            raise SourceSchemaError("Activity history is unexpectedly short")
    for record in store.db.execute("SELECT payload FROM observations WHERE active=1 AND source=?", (source,)):
        old = json.loads(record[0])
        if old["period"] not in groups.get((old["metric"], old["geography"]), set()):
            raise SourceSchemaError("Activity snapshot lost prior history; retaining previous data")
