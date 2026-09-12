import json
import tempfile
import unittest
from pathlib import Path

from aidash.sources.context import (MACRO, SUPPLY, SourceSchemaError, parse_fred, parse_postings,
                                    parse_buildout, parse_power, parse_adoption, stat_value,
                                    observation, validate_snapshot)
from aidash.store import Store
from aidash.dashboard import build_dashboard
from aidash.report import write_exports

FIXTURES = Path(__file__).parent / "fixtures"


class ContextTests(unittest.TestCase):
    def test_fred_missing_values_dates_and_series_contract(self):
        definitions = {"PAYEMS": ("employment", MACRO["employment"]), "UNRATE": ("unemployment", MACRO["unemployment"])}
        raw = b"observation_date,PAYEMS,UNRATE\n2024-02-01,100,4\n2024-03-01,.,4.1\n2024-04-01,102,\n"
        rows = parse_fred(raw, definitions, "macro", "https://example.org")
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0]["period"], "2024-02-29")
        self.assertFalse(any(row["value"] == 0 for row in rows))
        for invalid in (raw.replace(b",100,", b",nan,"), raw.replace(b"2024-03-01", b"2024-02-01"), raw.replace(b"PAYEMS,UNRATE", b"UNRATE,PAYEMS")):
            with self.assertRaises(ValueError):
                parse_fred(invalid, definitions, "macro", "https://example.org")

    def test_indeed_sorts_and_keeps_seasonally_adjusted_total(self):
        raw = b"date,jobcountry,indeed_job_postings_index_SA,indeed_job_postings_index_NSA,variable\n2026-08-02,US,101,900,total postings\n2026-08-01,US,100,800,total postings\n2026-08-01,US,50,400,new postings\n"
        rows = parse_postings(raw, "US")
        self.assertEqual([row["value"] for row in rows], [100, 101])
        with self.assertRaises(SourceSchemaError):
            parse_postings(raw.replace(b",US,", b",GB,"), "US")

    def test_fed_quarterly_values_are_not_zero_filled_or_annualized_again(self):
        rows = parse_buildout((FIXTURES / "fed_buildout.xlsx").read_bytes())
        equipment = [row for row in rows if row["metric"] == "equipment"]
        capex = [row for row in rows if row["metric"] == "capex"]
        memory = [row for row in rows if row["metric"] == "memory"]
        self.assertEqual(len(equipment), 21)
        self.assertEqual(len(memory), 65)
        self.assertTrue(all(int(row["period"][5:7]) % 3 == 0 for row in equipment))
        self.assertEqual(equipment[-1]["period"], "2026-03-31")
        self.assertAlmostEqual(capex[-1]["value"], 156.08)
        self.assertEqual(capex[-1]["unit"], "usd_bn")
        self.assertEqual(equipment[-1]["unit"], "usd_bn_saar")

    def test_json_stat_power_and_adoption_dimensions(self):
        power = parse_power((FIXTURES / "cso_power.json").read_bytes())
        self.assertEqual(power[-1]["period"], "2025-12-31")
        self.assertEqual(power[-1]["value"], 1991)
        adoption = parse_adoption((FIXTURES / "eurostat_adoption.json").read_bytes())
        self.assertEqual(len(adoption), 28)
        self.assertFalse(any(row["period"].startswith("2022") for row in adoption))
        values = {row["metric"]: row["value"] for row in adoption if row["period"].startswith("2025")}
        self.assertEqual(values["adoption_manufacturing"], 17.27)
        self.assertEqual(values["production"], 3.49)
        self.assertEqual(values["logistics"], 2.14)
        dataset = {"id": ["year", "sector"], "size": [2, 2], "dimension": {"year": {"category": {"index": {"2025": 1, "2024": 0}}}, "sector": {"category": {"index": {"B": 0, "A": 1}}}}, "value": {"3": 7}}
        self.assertEqual(stat_value(dataset, {"year": "2025", "sector": "A"}), 7)
        self.assertIsNone(stat_value(dataset, {"year": "2024", "sector": "A"}))

    def test_truncated_snapshot_retains_prior_history_and_export_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(directory)
            run = store.start_run("macro")
            rows = [observation("macro", "employment", MACRO["employment"], f"2025-{month:02}-28", 100 + month, "https://example.org") for month in range(1, 13)]
            validate_snapshot(store, "macro", rows)
            store.ingest_observations("macro", rows, run)
            with self.assertRaises(SourceSchemaError):
                validate_snapshot(store, "macro", rows[-1:])
            shifted = [{**row, "period": row["period"].replace("2025", "2026")} for row in rows]
            with self.assertRaises(SourceSchemaError):
                validate_snapshot(store, "macro", shifted)
            write_exports(store, "2026-09")
            payload = json.loads(build_dashboard(store, Path(directory) / "dashboard").read_text())
            series = payload["macro"]["US"]["employment"]
            self.assertEqual(len(series["points"]), 12)
            self.assertEqual(series["unit"], "thousand_jobs")
            self.assertIn("PAYEMS", series["url"])
            store.db.close()


if __name__ == "__main__":
    unittest.main()
