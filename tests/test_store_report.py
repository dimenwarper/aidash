import json
import tempfile
import unittest

from aidash.http import archived_fetch
from aidash.report import monthly_report
from aidash.store import Store


def observation(period="2026-08-31", value=4.0):
    return dict(source="test", metric="ai_postings", geography="US", period=period, value=value,
                unit="percent", frequency="daily", dimensions={}, url="https://example.org/data")


def document(abstract="AI discovered a protein."):
    return dict(source="europepmc", external_id="MED:123", doi="10.123/TEST", title="Study", abstract=abstract,
                published_at="2026-08-02", url="https://doi.org/10.123/test", metadata={})


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = Store(self.directory.name)
        self.run = self.store.start_run("test")

    def tearDown(self):
        self.store.db.close()
        self.directory.cleanup()

    def test_snapshot_rerun_revision_and_removal(self):
        first = [observation("2026-07-31", 3), observation()]
        self.assertEqual(self.store.ingest_observations("test", first, self.run)["added"], 2)
        self.assertEqual(self.store.ingest_observations("test", first, self.run)["unchanged"], 2)
        stats = self.store.ingest_observations("test", [observation(value=5)], self.run)
        self.assertEqual((stats["revised"], stats["removed"]), (1, 1))
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM revisions").fetchone()[0], 2)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM observations WHERE active=1").fetchone()[0], 1)

    def test_invalid_snapshot_preserves_entire_previous_snapshot(self):
        self.store.ingest_observations("test", [observation()], self.run)
        for invalid in ([], [observation(value=5), observation("not-a-date", 8)], [observation(value=float("nan"))], [observation(), observation()]):
            with self.assertRaises(ValueError):
                self.store.ingest_observations("test", invalid, self.run)
            row = self.store.db.execute("SELECT payload FROM observations WHERE active=1").fetchone()
            self.assertEqual(json.loads(row[0])["value"], 4)

    def test_monthly_change_is_percentage_points_and_gaps_are_not_zero(self):
        self.store.ingest_observations("test", [observation("2026-07-31", 3), observation()], self.run)
        metric = monthly_report(self.store, "2026-08")["metrics"][0]
        self.assertEqual(metric["change"], 1)
        self.assertEqual(metric["change_unit"], "percentage_points")
        missing = monthly_report(self.store, "2026-09")["metrics"][0]
        self.assertFalse(missing["has_observation_this_month"])
        self.assertIsNone(missing["change"])
        self.assertEqual(missing["latest"]["value"], 4)

    def test_only_current_reviewed_entries_are_public_and_review_history_is_preserved(self):
        self.store.ingest_documents([document(), dict(document(), doi="https://doi.org/10.123/test")], self.run)
        self.assertEqual(len(self.store.documents()), 1)
        self.assertEqual(monthly_report(self.store, "2026-08")["milestones"], [])
        key = "doi:10.123/test"
        payload = dict(notes="Primary study checked", event_date="2026-08-12", summary="A new protein result.",
                       discipline="biology", evidence_stage="experimentally_tested", evidence_url="https://example.org/evidence")
        self.store.review(key, "publish", payload)
        self.assertEqual(len(self.store.public_milestones("2026-08")), 1)
        self.assertEqual(self.store.public_milestones("2026-07"), [])
        self.store.ingest_documents([document("The original finding was corrected.")], self.run)
        self.assertEqual(self.store.public_milestones("2026-08"), [])
        self.store.review(key, "reject", {"notes": "Correction invalidates the claim"})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM reviews").fetchone()[0], 2)

    def test_raw_fetches_are_deduplicated_but_each_retrieval_has_provenance(self):
        fetch = archived_fetch(self.store, self.run, downloader=lambda url: b"same source bytes")
        fetch("https://example.org/data")
        fetch("https://example.org/data")
        self.assertEqual(len(list((self.store.root / "raw").glob("*.blob"))), 1)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM fetches").fetchone()[0], 2)


if __name__ == "__main__":
    unittest.main()
