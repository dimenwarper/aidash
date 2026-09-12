"""Public labor-market and value-chain indicators; no AI attribution is inferred.

Adapters return complete snapshots. Missing values remain missing, and upstream
schema failures abort ingestion before the previous snapshot can be replaced.
"""

import calendar
import csv
import io
import json
import math
import re
import zipfile
from datetime import date, datetime
from collections import defaultdict
from urllib.parse import urlencode
from xml.etree import ElementTree as ET

from .structured import SourceSchemaError

COUNTRIES = ("US", "GB", "CA", "AU", "DE", "FR", "IE", "IT", "NL")
POSTINGS_URL = "https://raw.githubusercontent.com/hiring-lab/job_postings_tracker/master/{0}/aggregate_job_postings_{0}.csv"
FED_PAGE = "https://www.federalreserve.gov/econres/notes/feds-notes/the-ai-buildout-and-the-economy-publicly-available-data-to-assess-ais-impact-20260717.html"
FED_XLSX = "https://www.federalreserve.gov/econres/notes/feds-notes/feds-ai-buildout-figure-data.xlsx"
CSO_URL = "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/MEC02/JSON-stat/1.0/en"
EUROSTAT_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_eb_ain2?lang=EN&geo=EU27_2020&unit=PC_ENT&indic_is=E_AI_TANY&indic_is=E_AI_PPP&indic_is=E_AI_PLOG&nace_r2=C&nace_r2=G&nace_r2=H&nace_r2=D&nace_r2=F"


def spec(name, unit, geography, frequency, url, note, **extra):
    return dict(name=name, unit=unit, geography=geography, frequency=frequency, url=url, note=note, **extra)


def fred_spec(series, name, unit, geography, note, **extra):
    return spec(name, unit, geography, "monthly", "https://fred.stlouisfed.org/series/" + series, note, fred_id=series, **extra)


MACRO = {
    "postings": spec("All job postings", "index", "", "daily", "https://github.com/hiring-lab/job_postings_tracker", "Indeed postings index; February 1, 2020 = 100. Seasonally adjusted, seven-day average."),
    "employment": fred_spec("PAYEMS", "Payroll employment", "thousand_jobs", "US", "BLS total nonfarm payroll jobs, seasonally adjusted. Jobs, not unique people."),
    "unemployment": fred_spec("UNRATE", "Unemployment rate", "percent", "US", "BLS unemployment, age 16+, percent of the labor force; seasonally adjusted."),
    "participation": fred_spec("CIVPART", "Labor-force participation", "percent", "US", "BLS civilian noninstitutional population age 16+, seasonally adjusted."),
    "openings": fred_spec("JTSJOL", "Job openings", "thousand_jobs", "US", "BLS unfilled openings on the last business day, seasonally adjusted."),
    "earnings": fred_spec("CES0500000003", "Average hourly earnings", "usd_hour", "US", "BLS private-sector employees, nominal USD per hour, seasonally adjusted. Workforce composition affects the average."),
    "quits": fred_spec("JTSQUR", "Quits rate", "percent", "US", "BLS monthly quits as a percent of employment, seasonally adjusted."),
    "layoffs": fred_spec("JTSLDR", "Layoffs & discharges", "percent", "US", "BLS monthly layoffs and discharges as a percent of employment, seasonally adjusted."),
}


def macro_spec(metric, country):
    if metric == "unemployment" and country != "US":
        return fred_spec("LRHUTTTT" + country + "M156S", "Unemployment rate", "percent", country,
                         "OECD harmonized unemployment, age 15+, seasonally adjusted. UK periods are middle months of rolling quarters; US uses BLS age 16+.")
    return {**MACRO[metric], "geography": country}


SUPPLY = {
    "semiconductors": fred_spec("IPG3344S", "Semiconductor production", "index", "US", "Federal Reserve industrial production: semiconductors and other electronic components. 2017 = 100, seasonally adjusted. Includes non-AI chips.", stage="Chips", group="infrastructure"),
    "memory": spec("DRAM export prices", "index", "KR", "monthly", FED_PAGE, "Bank of Korea DRAM export price index, 2022 = 100. Broad DRAM, not an HBM-specific price. Federal Reserve compilation dated July 17, 2026.", stage="Memory", group="infrastructure"),
    "equipment": spec("Computing equipment investment", "usd_bn_saar", "US", "quarterly", FED_PAGE, "BEA computers and peripheral equipment investment, nominal $bn at a seasonally adjusted annual rate. Includes non-AI computing. Federal Reserve compilation dated July 17, 2026.", stage="Equipment", group="infrastructure"),
    "construction": spec("Data-center construction", "usd_bn_saar", "US", "monthly", FED_PAGE, "Census private data-center construction, nominal $bn at a seasonally adjusted annual rate. Structures; excludes most computing equipment. Federal Reserve compilation dated July 17, 2026.", stage="Data centers", group="infrastructure"),
    "capex": spec("Selected cloud-firm capex", "usd_bn", "Global", "quarterly", FED_PAGE, "Quarterly nominal PP&E purchases: Amazon, Google, Meta, Microsoft, Oracle and CoreWeave. Includes non-AI spending. Federal Reserve compilation dated July 17, 2026.", stage="Cloud capacity", group="infrastructure"),
    "power": spec("Data-center electricity", "gwh", "IE", "quarterly", "https://www.cso.ie/en/releasesandpublications/ep/p-dcmec/datacentresmeteredelectricityconsumption2025/", "CSO metered electricity used by all Irish data centers. A regional measure, including non-AI workloads; not global AI energy use.", stage="Electricity", group="adjacent"),
    "grid": fred_spec("PCU335311335311", "Transformer producer prices", "index", "US", "BLS electric power and specialty transformer manufacturing PPI. June 1981 = 100, not seasonally adjusted. Broad grid equipment pricing, not AI-attributable demand or lead times.", stage="Grid hardware", group="adjacent"),
    "copper": fred_spec("PCOPPUSDM", "Copper price", "usd_tonne", "Global", "IMF global benchmark, nominal USD per metric ton, monthly average, not seasonally adjusted. Many industries affect this price.", stage="Materials", group="adjacent"),
}
for _id, _stage in (("manufacturing", "Manufacturing"), ("trade", "Wholesale & retail"), ("transport", "Transport & storage"), ("energy", "Energy utilities"), ("building", "Construction")):
    SUPPLY["adoption_" + _id] = spec("Enterprises using AI", "percent", "EU27", "annual", "https://ec.europa.eu/eurostat/databrowser/view/isoc_eb_ain2/default/table?lang=en", "Eurostat enterprises with 10+ persons employed; any surveyed AI technology. Adoption does not measure productivity gains. The 2025 questionnaire added image, video and audio generation. 2022 is unavailable.", stage=_stage, group="adoption")
for _id, _stage, _name in (("production", "Manufacturing", "AI in production processes"), ("logistics", "Transport & storage", "AI in logistics")):
    SUPPLY[_id] = spec(_name, "percent", "EU27", "annual", SUPPLY["adoption_trade"]["url"], "Eurostat enterprises with 10+ persons employed. Percent of ALL enterprises in this sector, not just AI adopters. 2022 is unavailable.", stage=_stage, group="operations")


def month_end(year, month):
    return date(year, month, calendar.monthrange(year, month)[1]).isoformat()


def quarter_end(period):
    match = re.fullmatch(r"(\d{4}):?Q([1-4])", period)
    if not match:
        raise SourceSchemaError("Invalid quarter: " + period)
    return month_end(int(match[1]), int(match[2]) * 3)


def finite(value):
    if isinstance(value, bool):
        raise SourceSchemaError("Boolean observation")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise SourceSchemaError("Non-numeric observation") from exc
    if not math.isfinite(result) or result < 0:
        raise SourceSchemaError("Invalid nonnegative observation")
    return result


def observation(source, metric, meta, period, value, url):
    date.fromisoformat(period)
    value = finite(value)
    if meta["unit"] == "percent" and value > 100:
        raise SourceSchemaError("Percent exceeds 100")
    return dict(source=source, metric=metric, geography=meta["geography"], period=period, value=value,
                unit=meta["unit"], frequency=meta["frequency"], dimensions={}, url=url)


def fred_url(series):
    return "https://fred.stlouisfed.org/graph/fredgraph.csv?" + urlencode({"id": ",".join(series), "cosd": "2019-01-01"}, safe=",")


def parse_fred(raw, definitions, source, url):
    """definitions: FRED ID -> (internal metric, metadata). Blank is not zero."""
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    if reader.fieldnames != ["observation_date", *definitions]:
        raise SourceSchemaError("FRED CSV columns changed")
    rows, seen, counts = [], set(), {key: 0 for key in definitions}
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise SourceSchemaError("Malformed FRED CSV row")
        day = date.fromisoformat(row["observation_date"])
        if day.day != 1 or day in seen:
            raise SourceSchemaError("FRED date must be a unique monthly reference")
        seen.add(day)
        if day.year < 2019:
            continue
        for series, (metric, meta) in definitions.items():
            if row[series].strip() in ("", "."):
                continue
            rows.append(observation(source, metric, meta, month_end(day.year, day.month), row[series], url))
            counts[series] += 1
    if not all(counts.values()):
        raise SourceSchemaError("FRED series is empty")
    return rows


def parse_postings(raw, country):
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    if reader.fieldnames != ["date", "jobcountry", "indeed_job_postings_index_SA", "indeed_job_postings_index_NSA", "variable"]:
        raise SourceSchemaError("Indeed aggregate columns changed")
    rows, seen = [], set()
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise SourceSchemaError("Malformed Indeed aggregate row")
        if row["variable"] != "total postings":
            continue
        period = row["date"]
        if row["jobcountry"] != country or period in seen:
            raise SourceSchemaError("Unexpected country or duplicate Indeed date")
        seen.add(period)
        rows.append(observation("macro", "postings", macro_spec("postings", country), period, row["indeed_job_postings_index_SA"], POSTINGS_URL.format(country)))
    if not rows:
        raise SourceSchemaError("Indeed aggregate has no total postings")
    return sorted(rows, key=lambda row: row["period"])


def fetch_macro(fetch):
    definitions = {meta["fred_id"]: (metric, meta) for metric, meta in MACRO.items() if "fred_id" in meta}
    url = fred_url(definitions)
    rows = parse_fred(fetch(url), definitions, "macro", url)
    for country in COUNTRIES[1:]:
        meta = macro_spec("unemployment", country)
        definitions = {meta["fred_id"]: ("unemployment", meta)}
        url = fred_url(definitions)
        rows.extend(parse_fred(fetch(url), definitions, "macro", url))
    for country in COUNTRIES:
        rows.extend(parse_postings(fetch(POSTINGS_URL.format(country)), country))
    return rows


def workbook_rows(raw):
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        strings = ["".join(node.text or "" for node in item.iter(ns + "t")) for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        links = {item.attrib["Id"]: item.attrib["Target"] for item in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        sheets = {}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).find(ns + "sheets"):
            target = links[sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]]
            path = target.lstrip("/") if target.startswith("/") else "xl/" + target
            sheet_rows = []
            for row in ET.fromstring(archive.read(path)).iter(ns + "row"):
                values = {}
                for cell in row:
                    value = cell.find(ns + "v")
                    if value is not None and value.text is not None:
                        values[re.sub(r"\d", "", cell.attrib["r"])] = strings[int(value.text)] if cell.attrib.get("t") == "s" else value.text
                sheet_rows.append((int(row.attrib["r"]), values))
            sheets[sheet.attrib["name"]] = sheet_rows
        return sheets


def parse_buildout(raw):
    sheets = workbook_rows(raw)
    rows, counts = [], {}
    for sheet, columns in (("Figure_3", {"memory": ("B",)}), ("Figure_4", {"capex": ("B", "C", "D", "E", "F")}), ("Figure_5", {"construction": ("B",), "equipment": ("C",)})):
        if sheet not in sheets:
            raise SourceSchemaError("Missing Fed worksheet " + sheet)
        header = dict(sheets[sheet]).get(4, {})
        expected = {"Figure_3": {"B": "DRAM"}, "Figure_4": {"B": "Amazon", "C": "Google", "D": "Meta", "E": "Microsoft", "F": "Other"}, "Figure_5": {"B": "Data center", "C": "Computers"}}[sheet]
        if any(term.lower() not in header.get(column, "").lower() for column, term in expected.items()):
            raise SourceSchemaError("Fed workbook headers changed: " + sheet)
        for rownum, cells in sheets[sheet]:
            if rownum < 5:
                continue
            label = cells.get("A", "").strip()
            try:
                if sheet == "Figure_4":
                    period = quarter_end(label)
                else:
                    day = datetime.strptime(label, "%B %Y")
                    period = month_end(day.year, day.month)
            except ValueError:
                if any(re.fullmatch(r"[\d.]+", cells.get(col, "")) for cols in columns.values() for col in cols):
                    raise SourceSchemaError("Invalid Fed observation period")
                continue
            for metric, cols in columns.items():
                if not any(col in cells for col in cols):
                    continue
                if not all(col in cells for col in cols):
                    raise SourceSchemaError("Incomplete company capex observation")
                if metric == "equipment" and int(period[5:7]) % 3:
                    raise SourceSchemaError("Equipment observation is not quarterly")
                rows.append(observation("supply-chain", metric, SUPPLY[metric], period, sum(finite(cells[col]) for col in cols), FED_XLSX))
                counts[metric] = counts.get(metric, 0) + 1
    if set(counts) != {"memory", "capex", "construction", "equipment"}:
        raise SourceSchemaError("Empty Fed buildout series")
    return rows


def stat_value(dataset, selection):
    """Resolve JSON-stat coordinates, respecting axis/category order and nulls."""
    layout = dataset if "id" in dataset else dataset["dimension"]
    if set(selection) != set(layout["id"]):
        raise SourceSchemaError("JSON-stat dimensions changed")
    offset = 0
    for axis, size in zip(layout["id"], layout["size"]):
        categories = dataset["dimension"][axis]["category"]["index"]
        index = categories.index(selection[axis]) if isinstance(categories, list) else categories[selection[axis]]
        offset = offset * size + index
    values = dataset["value"]
    return values[offset] if isinstance(values, list) else values.get(str(offset))


def parse_power(raw):
    dataset = json.loads(raw)["dataset"]
    rows = []
    for quarter in dataset["dimension"]["TLIST(Q1)"]["category"]["index"]:
        value = stat_value(dataset, {"STATISTIC": "MEC02", "TLIST(Q1)": quarter, "C03907V04659": "10"})
        if value is not None:
            rows.append(observation("supply-chain", "power", SUPPLY["power"], quarter_end(quarter), value, CSO_URL))
    if not rows:
        raise SourceSchemaError("No CSO electricity data")
    return rows


def parse_adoption(raw):
    dataset = json.loads(raw)
    rows, counts = [], set()
    for sector, label in (("C", "manufacturing"), ("D", "energy"), ("F", "building"), ("G", "trade"), ("H", "transport")):
        indicators = [("E_AI_TANY", "adoption_" + label)]
        if sector == "C":
            indicators.append(("E_AI_PPP", "production"))
        if sector == "H":
            indicators.append(("E_AI_PLOG", "logistics"))
        for indicator, metric in indicators:
            for year in dataset["dimension"]["time"]["category"]["index"]:
                value = stat_value(dataset, dict(freq="A", size_emp="GE10", nace_r2=sector, indic_is=indicator, unit="PC_ENT", geo="EU27_2020", time=year))
                if value is not None:
                    rows.append(observation("supply-chain", metric, SUPPLY[metric], year + "-12-31", value, EUROSTAT_URL))
                    counts.add(metric)
    if len(counts) != 7:
        raise SourceSchemaError("Incomplete Eurostat sector coverage")
    return rows


def fetch_supply(fetch):
    definitions = {meta["fred_id"]: (metric, meta) for metric, meta in SUPPLY.items() if "fred_id" in meta}
    url = fred_url(definitions)
    rows = parse_fred(fetch(url), definitions, "supply-chain", url)
    rows.extend(parse_buildout(fetch(FED_XLSX)))
    rows.extend(parse_power(fetch(CSO_URL)))
    rows.extend(parse_adoption(fetch(EUROSTAT_URL)))
    return rows


def validate_snapshot(store, source, rows):
    """Reject plausible HTTP-200 truncation before replacing stored history."""
    incoming, previous = defaultdict(set), defaultdict(set)
    frequencies = {}
    for row in rows:
        key = (row["metric"], row["geography"])
        incoming[key].add(row["period"])
        frequencies[key] = row["frequency"]
    for record in store.db.execute("SELECT payload FROM observations WHERE source=? AND active=1", (source,)):
        row = json.loads(record[0])
        previous[(row["metric"], row["geography"])].add(row["period"])
    minimum = {"daily": 300, "monthly": 12, "quarterly": 8, "annual": 3}
    for key, periods in incoming.items():
        if len(periods) < minimum[frequencies[key]]:
            raise SourceSchemaError("Insufficient historical coverage: " + "/".join(key))
    for key, periods in previous.items():
        replacement = incoming.get(key, set())
        if not replacement or min(replacement) > min(periods) or max(replacement) < max(periods) or len(periods - replacement) > max(1, len(periods) * .02):
            raise SourceSchemaError("Source history shrank unexpectedly; previous snapshot retained: " + "/".join(key))
