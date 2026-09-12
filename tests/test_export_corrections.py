import json
import tempfile
import unittest

from aidash.report import monthly_report, write_exports
from aidash.store import Store
from tests.test_store_report import document, observation


class ExportCorrectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(self.tmp.name)
        self.run = self.store.start_run("test")

    def tearDown(self):
        self.store.db.close()
        self.tmp.cleanup()

    def test_missing_previous_month_is_not_treated_as_zero_or_adjacent(self):
        self.store.ingest_observations("test", [observation("2026-01-01", 10), observation("2026-03-01", 2)], self.run)
        metric = monthly_report(self.store, "2026-03")["metrics"][0]
        self.assertTrue(metric["has_observation_this_month"])
        self.assertIsNone(metric["change"])
        self.assertIsNone(metric["previous"])

    def test_later_export_removes_rejected_milestone_from_prior_month_file(self):
        self.store.ingest_documents([document()], self.run)
        key = "doi:10.123/test"
        self.store.review(key, "publish", dict(notes="Checked", event_date="2026-08-02", summary="Reviewed result",
                          discipline="biology", evidence_stage="reported", evidence_url="https://example.org/paper"))
        august = write_exports(self.store, "2026-08")
        self.assertEqual(len(json.loads(august.read_text())["milestones"]), 1)
        self.store.review(key, "reject", {"notes": "New evidence invalidates the result"})
        write_exports(self.store, "2026-09")
        self.assertEqual(json.loads(august.read_text())["milestones"], [])


if __name__ == "__main__":
    unittest.main()
