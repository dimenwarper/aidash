import copy
import json
import tempfile
import unittest
from pathlib import Path

from aidash.sources.activity import catalog, parse_taiwan, parse_energy, company_rows, validate_activity
from aidash.sources.trade import parse_response, trade_observations, code_batches, CODES, request_url
from aidash.store import Store


class ActivityTests(unittest.TestCase):
    def test_roc_dates_preserve_missing_values_and_reject_rebasing(self):
        item = catalog("taiwan-activity")["metrics"][0]
        raw = "統計項目,行業代碼,行業別,資料期(民國年),統計值(指數),計量單位\n生產指數,2611 ,積體電路製造業,11302,110,110年=100\n生產指數,2611,積體電路製造業,11303,--,110年=100\n"
        rows = parse_taiwan(raw.encode(), [item])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["period"], "2024-02-29")
        self.assertEqual(rows[0]["value"], 110)
        self.assertEqual(rows[0]["metadata"]["industry_code"], "2611")
        for changed in (raw.replace("110年=100", "115年=100"), raw.replace("11303", "11302"), raw.replace(",110,", ",NaN,"), raw.replace("11302", "11313")):
            with self.assertRaises(ValueError):
                parse_taiwan(changed.encode(), [item])

    def test_eia_drops_annual_totals_without_scaling_twh(self):
        raw = b"MSN,YYYYMM,Value,Column_Order,Description,Unit\nELETPUS,202601,354.691,1,Generation,Billion Kilowatthours\nELETPUS,202613,4000,1,Generation,Billion Kilowatthours\nESTCPUS,202601,320.096,2,Sales,Billion Kilowatthours\nESTCPUS,202602,Not Available,2,Sales,Billion Kilowatthours\n"
        rows = parse_energy(raw)
        self.assertEqual([r["value"] for r in rows], [354.691, 320.096])
        self.assertEqual({r["period"] for r in rows}, {"2026-01-31"})
        self.assertEqual({r["unit"] for r in rows}, {"twh"})
        with self.assertRaises(ValueError):
            parse_energy(raw.replace(b"Billion Kilowatthours", b"Million Kilowatthours"))

    def test_trade_rejects_mirror_flows_bad_dimensions_and_cap(self):
        raw = (Path(__file__).parent / "fixtures/comtrade_sample.json").read_bytes()
        rows = trade_observations(raw, 2025)
        self.assertTrue(rows)
        self.assertTrue(all(r["metadata"]["origin"] == "528" for r in rows))
        self.assertTrue(all(r["unit"] == "usd" for r in rows))
        self.assertTrue(all(r["metadata"]["destination"] != "0" for r in rows))
        self.assertTrue(all(r["evidence"]["coverage"]["reporter_count"] < 12 for r in rows))
        fixture = json.loads(raw)
        for field, value in [("flowCode", "M"), ("refYear", 2024), ("primaryValue", -1), ("partner2Code", 1), ("classificationCode", "unknown"), ("isOriginalClassification", False)]:
            changed = copy.deepcopy(fixture)
            changed["data"][0][field] = value
            with self.assertRaises(ValueError):
                parse_response(json.dumps(changed), 2025)
        capped = {"count": 500, "data": fixture["data"][:1] * 500}
        with self.assertRaisesRegex(ValueError, "truncation"):
            parse_response(json.dumps(capped), 2025)

    def test_company_units_fiscal_dates_and_point_provenance(self):
        rows = company_rows()
        laser = [r for r in rows if r["metric"] == "trumpf_euv_revenue"]
        self.assertEqual(laser[-1]["period"], "2025-06-30")
        self.assertEqual(laser[-1]["unit"], "eur_mn")
        self.assertEqual(laser[-1]["value"], 724)
        self.assertIn("fiscal year ending June", laser[-1]["metadata"]["period_basis"])
        for row in rows:
            self.assertEqual(row["evidence"]["url"], row["url"])
        physical = [r for r in rows if r["metric"] == "tsmc_wafers"]
        self.assertEqual(physical[-1]["value"], 4336)
        self.assertEqual(physical[-1]["unit"], "thousand_wafers")
        systems = [r for r in rows if r["metric"] == "asml_euv_recognized"]
        self.assertIn("revenue was recognized", systems[-1]["metadata"]["note"])

    def test_material_batches_and_commodity_specific_coverage(self):
        batches = code_batches()
        self.assertEqual(len(batches), 4)
        self.assertTrue(all(1 <= len(batch) <= 3 for batch in batches))
        self.assertEqual([code for batch in batches for code in batch], CODES)
        with self.assertRaises(ValueError):
            request_url(2024, CODES)
        raw = (Path(__file__).parent / "fixtures/comtrade_materials.json").read_bytes()
        rows = trade_observations(raw, 2024, ['280461', '284920', '281820'])
        silicon = next(r for r in rows if r['metadata']['commodity'] == '280461')
        carbide = next(r for r in rows if r['metadata']['commodity'] == '284920')
        self.assertEqual(silicon['evidence']['coverage']['reporter_count'], 1)
        self.assertEqual(carbide['evidence']['coverage']['reporter_count'], 2)
        self.assertIn('Mexico', silicon['evidence']['coverage']['missing'])
        self.assertNotIn('Mexico', carbide['evidence']['coverage']['missing'])
        self.assertIn('solar', silicon['metadata']['note'])
        self.assertIn('cmdCode=280461,284920,281820', silicon['url'])
        with self.assertRaises(ValueError):
            parse_response(raw, 2024)  # A chips request cannot accept material rows.

    def test_truncated_refresh_preserves_existing_source_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(directory)
            rows = company_rows()
            validate_activity(store, "activity-companies", rows)
            run = store.start_run("activity-companies")
            store.ingest_observations("activity-companies", rows, run)
            with self.assertRaises(ValueError):
                validate_activity(store, "activity-companies", rows[1:])
            self.assertEqual(store.db.execute("SELECT count(*) FROM observations WHERE active=1").fetchone()[0], len(rows))
            store.db.close()


if __name__ == "__main__":
    unittest.main()
