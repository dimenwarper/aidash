"""Check the boundary between private ingestion state and browser data."""

import json
import tempfile
import unittest
from pathlib import Path

from aidash.dashboard import build_dashboard
from aidash.report import write_exports
from aidash.store import Store
from tests.test_extraction import RESULT
from tests.test_store_report import document, observation


class DashboardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(self.tmp.name)
        self.run = self.store.start_run("test")
        self.output = Path(self.tmp.name) / "site-data"
        write_exports(self.store, "2026-08")

    def tearDown(self):
        self.store.db.close()
        self.tmp.cleanup()

    def build(self):
        return json.loads(build_dashboard(self.store, self.output).read_text())

    def test_browser_payload_omits_abstracts_quotes_and_run_details(self):
        self.store.ingest_documents([document()], self.run)
        self.store.save_extraction(self.store.documents()[0], "model", "v1", RESULT)
        payload = self.build()
        paper = payload["papers"][0]
        self.assertEqual(paper["draft"]["summary"], RESULT["summary"])
        self.assertEqual(set(paper["draft"]), {"summary", "ai_contribution", "evidence_stage", "limitations"})
        self.assertNotIn("abstract", paper)
        self.assertNotIn("metadata", paper)
        self.assertEqual(set(payload["reports"]["2026-08"]), {"month", "milestones"})
        self.assertEqual(payload["reports"]["2026-08"]["milestones"], [])

    def test_reviews_and_corrections_reach_dashboard_without_stale_drafts(self):
        self.store.ingest_documents([document()], self.run)
        self.store.save_extraction(self.store.documents()[0], "model", "v1", RESULT)
        key = self.store.documents()[0]["id"]
        self.store.review(key, "publish", dict(notes="Checked", event_date="2026-08-02", summary="Reviewed result",
                          discipline="biology", evidence_stage="reported", evidence_url="https://example.org/paper"))
        payload = self.build()
        self.assertEqual(payload["papers"], [])
        self.assertEqual(len(payload["reports"]["2026-08"]["milestones"]), 1)
        self.store.ingest_documents([document("The original finding was corrected.")], self.run)
        payload = self.build()
        self.assertEqual(payload["reports"]["2026-08"]["milestones"], [])
        self.assertEqual(payload["papers"][0]["status"], "needs_rereview")
        self.assertIsNone(payload["papers"][0]["draft"])
        self.store.review(key, "reject", {"notes": "Invalidated"})
        self.assertEqual(self.build()["papers"], [])

    def test_defaults_to_latest_exported_month_and_uses_revisions(self):
        write_exports(self.store, "2026-09")
        july = dict(observation("2026-07-31", 3), source="indeed")
        august = dict(observation("2026-08-31", 4), source="indeed")
        self.store.ingest_observations("indeed", [july, august], self.run)
        self.store.ingest_observations("indeed", [dict(august, value=5)], self.run)
        payload = self.build()
        self.assertEqual(payload["default_month"], "2026-09")
        self.assertEqual(payload["jobs"]["US"]["points"], [["2026-08-31", 5]])


if __name__ == "__main__":
    unittest.main()
