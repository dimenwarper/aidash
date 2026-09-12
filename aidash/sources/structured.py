"""Small, strict adapters for public quantitative sources.

The caller supplies fetch_bytes(url), so network policy and raw snapshots stay
outside parsing. A schema/data error aborts the source before any rows are saved.
"""

import csv
import io
import math
import re
from collections import Counter
from datetime import date, datetime
from html.parser import HTMLParser
from typing import Callable


INDEED_CSV_URL = "https://raw.githubusercontent.com/hiring-lab/ai-tracker/main/AI_posting.csv"
INDEED_METHOD_URL = "https://github.com/hiring-lab/ai-tracker/blob/main/README.md"
FDA_URL = (
    "https://www.fda.gov/medical-devices/software-medical-device-samd/"
    "artificial-intelligence-enabled-medical-devices"
)

SOURCE_METADATA = {
    "indeed": {
        "name": "Indeed Hiring Lab AI Tracker",
        "url": INDEED_METHOD_URL,
        "data_url": INDEED_CSV_URL,
        "license": "CC BY 4.0; attribute Indeed Hiring Lab",
        "refresh_cadence": "monthly",
        "measurement": "Daily percent of Indeed job postings mentioning AI terms; seven-day trailing average.",
        "limitations": [
            "Measures demand for AI-related skills, not employment, job displacement, or causal effects.",
            "Platform coverage varies by country; country series do not form an OECD aggregate.",
            "Values are already percentages, not fractions; do not multiply by 100.",
            "The README mentions a GenAI CSV that was absent at source verification on 2026-09-11.",
        ],
    },
    "fda": {
        "name": "FDA AI-Enabled Medical Devices List",
        "url": FDA_URL,
        "refresh_cadence": "periodic; source does not promise a fixed schedule",
        "measurement": "Count of listed marketing authorization submissions by decision month and FDA lead panel.",
        "limitations": [
            "The FDA says this list is not comprehensive; it may backfill decisions in subsequent updates.",
            "Authorizations are not unique products, scientific breakthroughs, or demonstrated clinical outcomes.",
            "Latest and historical months may be incomplete; absent months and specialties are not filled with zero.",
            "Panel (Lead) is an FDA specialty classification, not a scientific discipline.",
        ],
    },
}


class SourceSchemaError(ValueError):
    """The upstream source no longer matches the adapter's data contract."""


def fetch_indeed(fetch_bytes: Callable[[str], bytes]) -> list[dict]:
    """Return country-level daily percentages, preserving the source's smoothing."""
    reader = csv.DictReader(io.StringIO(fetch_bytes(INDEED_CSV_URL).decode("utf-8-sig")))
    expected = ["date", "jobcountry", "AI_share_postings"]
    if reader.fieldnames != expected:
        raise SourceSchemaError("Indeed CSV schema changed: expected " + ",".join(expected))
    observations = []
    seen = set()
    for line, row in enumerate(reader, start=2):
        if None in row or any(value is None for value in row.values()):
            raise SourceSchemaError("Indeed malformed CSV row at line %s" % line)
        period = row["date"].strip()
        country = row["jobcountry"].strip()
        try:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", period):
                raise ValueError("date must be YYYY-MM-DD")
            date.fromisoformat(period)
            if not re.fullmatch(r"[A-Z]{2}", country):
                raise ValueError("country must be a two-letter uppercase code")
            value = float(row["AI_share_postings"])
            if not math.isfinite(value) or not 0 <= value <= 100:
                raise ValueError("percent must be finite and between 0 and 100")
        except ValueError as exc:
            raise SourceSchemaError("Indeed invalid value at line %s: %s" % (line, exc)) from exc
        if (country, period) in seen:
            raise SourceSchemaError("Indeed duplicate country/date: %s %s" % (country, period))
        seen.add((country, period))
        observations.append({
            "source": "indeed", "metric": "ai_job_posting_share", "geography": country,
            "period": period, "value": value, "unit": "percent", "frequency": "daily",
            "dimensions": {}, "url": INDEED_CSV_URL,
        })
    if not observations:
        raise SourceSchemaError("Indeed source has no observations")
    return sorted(observations, key=lambda row: (row["geography"], row["period"]))


class _Tables(HTMLParser):
    """Read actual HTML table cells, retaining linked text and decoded entities."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.table = None
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            if self.table is not None:
                raise SourceSchemaError("FDA nested table structure is unsupported")
            self.table = []
        elif self.table is not None and tag == "tr":
            if self.row is not None:
                raise SourceSchemaError("FDA malformed table row")
            self.row = []
        elif self.row is not None and tag in ("td", "th"):
            if self.cell is not None:
                raise SourceSchemaError("FDA malformed table cell")
            if any(key in ("rowspan", "colspan") and value != "1" for key, value in attrs):
                raise SourceSchemaError("FDA table uses merged cells")
            self.cell = []
        elif self.cell is not None and tag == "br":
            self.cell.append(" ")

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.cell is not None:
                raise SourceSchemaError("FDA unclosed table cell")
            self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            if self.row is not None:
                raise SourceSchemaError("FDA unclosed table row")
            self.tables.append(self.table)
            self.table = None


def fetch_fda(fetch_bytes: Callable[[str], bytes]) -> list[dict]:
    """Count listed submissions; do not invent zero values for unobserved months."""
    parser = _Tables()
    parser.feed(fetch_bytes(FDA_URL).decode("utf-8-sig"))
    parser.close()
    if parser.table is not None:
        raise SourceSchemaError("FDA truncated HTML table")
    expected = ["Date of Final Decision", "Submission Number", "Device", "Company", "Panel (Lead)", "Primary Product Code"]
    matches = [table for table in parser.tables if table and table[0] == expected]
    if len(matches) != 1:
        raise SourceSchemaError("FDA device table schema changed or is missing")
    rows = matches[0][1:]
    if not rows:
        raise SourceSchemaError("FDA source has no device records")
    counts = Counter()
    seen = set()
    for line, row in enumerate(rows, start=2):
        if len(row) != len(expected) or not all(row):
            raise SourceSchemaError("FDA malformed device row %s" % line)
        decision, submission, _device, _company, specialty, _product_code = row
        try:
            if not re.fullmatch(r"\d{2}/\d{2}/\d{4}", decision):
                raise ValueError("date must be MM/DD/YYYY")
            period = datetime.strptime(decision, "%m/%d/%Y").date().replace(day=1).isoformat()
        except ValueError as exc:
            raise SourceSchemaError("FDA invalid decision date in row %s: %s" % (line, decision)) from exc
        if submission in seen:
            raise SourceSchemaError("FDA duplicate submission: " + submission)
        seen.add(submission)
        counts[(period, "")] += 1
        counts[(period, specialty)] += 1
    return [
        {
            "source": "fda", "metric": "ai_medical_device_authorizations", "geography": "US",
            "period": period, "value": value, "unit": "count", "frequency": "monthly",
            "dimensions": {"specialty": specialty} if specialty else {}, "url": FDA_URL,
        }
        for (period, specialty), value in sorted(counts.items())
    ]
