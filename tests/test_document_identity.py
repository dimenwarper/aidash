import json
import tempfile
import unittest

from aidash.store import Store, digest


def document(external_id="MED:123", doi=None, **changes):
    return {
        "source": "europepmc", "external_id": external_id, "doi": doi,
        "title": "Protein design study", "abstract": "An experimentally tested AI-designed protein.",
        "published_at": "2026-08-02", "url": "https://example.org/study",
        "metadata": {"publication_types": ["Journal Article"]}, **changes,
    }


class DocumentIdentityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = Store(self.directory.name)
        self.run = self.store.start_run("science")

    def tearDown(self):
        self.store.db.close()
        self.directory.cleanup()

    def publish(self, key):
        self.store.review(key, "publish", {
            "notes": "Primary paper checked", "event_date": "2026-08-02",
            "summary": "A protein design result.", "discipline": "biology",
            "evidence_stage": "experimentally_tested", "evidence_url": "https://example.org/study",
        })

    def aliases(self):
        return dict(self.store.db.execute("SELECT alias,document_id FROM document_aliases"))

    def test_doi_enrichment_preserves_id_and_invalidates_previous_approval(self):
        initial = document()
        self.store.ingest_documents([initial], self.run)
        key = self.store.documents()[0]["id"]
        self.publish(key)
        corrected = document(doi="HTTPS://DX.DOI.ORG/10.1234/TEST", abstract="The protein result was corrected.")
        stats = self.store.ingest_documents([corrected], self.run)
        self.assertEqual(stats, {"added": 0, "updated": 1, "unchanged": 0})
        rows = self.store.documents()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], key)
        self.assertEqual(json.loads(rows[0]["payload"])["doi"], "10.1234/test")
        self.assertEqual(self.aliases(), {"registry:europepmc:MED:123": key, "doi:10.1234/test": key})
        self.assertEqual(self.store.public_milestones("2026-08"), [])
        self.assertEqual(self.store.latest_review(key)["decision"], "publish")
        self.assertEqual(self.store.ingest_documents([corrected], self.run)["unchanged"], 1)

    def test_same_doi_binds_multiple_registry_ids_and_remembers_them(self):
        first = document(doi="10.1234/test")
        self.store.ingest_documents([first], self.run)
        key = self.store.documents()[0]["id"]
        other = document("PMC:PMC456", doi="doi:10.1234/TEST")
        self.assertEqual(self.store.ingest_documents([other], self.run)["unchanged"], 1)
        self.assertEqual(self.aliases(), {
            "registry:europepmc:MED:123": key, "registry:europepmc:PMC:PMC456": key,
            "doi:10.1234/test": key,
        })
        # The earlier registry alias survives replacement of the current payload.
        stats = self.store.ingest_documents([document(doi=None)], self.run)
        self.assertEqual(stats["added"], 0)
        self.assertEqual(len(self.store.documents()), 1)
        self.assertEqual(self.store.documents()[0]["id"], key)

    def test_retraction_metadata_alone_invalidates_review_and_extraction(self):
        self.store.ingest_documents([document(doi="10.1234/test")], self.run)
        original = self.store.documents()[0]
        self.publish(original["id"])
        self.store.save_extraction(original, "example-model", "v1", {"is_candidate": True})
        changed = document(doi="10.1234/test", metadata={"publication_types": ["Journal Article", "Retracted Publication"]})
        self.assertEqual(self.store.ingest_documents([changed], self.run)["updated"], 1)
        current = self.store.documents()[0]
        self.assertNotEqual(original["content_hash"], current["content_hash"])
        self.assertEqual(self.store.public_milestones("2026-08"), [])
        self.assertIsNone(self.store.db.execute("SELECT 1 FROM extractions WHERE document_id=? AND content_hash=?",
                                               (current["id"], current["content_hash"])).fetchone())

    def test_conflicting_aliases_roll_back_entire_batch_and_preserve_reviews(self):
        self.store.ingest_documents([document(), document("MED:456", doi="10.1234/other")], self.run)
        self.publish("europepmc:MED:123")
        before = [dict(row) for row in self.store.documents()]
        before_aliases = self.aliases()
        with self.assertRaisesRegex(ValueError, "manual reconciliation required"):
            self.store.ingest_documents([
                document("MED:789", doi="10.1234/new"),
                document(doi="10.1234/other"),
            ], self.run)
        self.assertEqual([dict(row) for row in self.store.documents()], before)
        self.assertEqual(self.aliases(), before_aliases)
        self.assertEqual(len(self.store.public_milestones("2026-08")), 1)

    def test_legacy_database_backfills_aliases_and_invalidates_metadata_blind_hash(self):
        item = document(doi="10.1234/test")
        self.store.ingest_documents([item], self.run)
        key = self.store.documents()[0]["id"]
        legacy_hash = digest({field: item.get(field) for field in ("title", "abstract", "published_at", "doi", "url")})
        with self.store.db:
            self.store.db.execute("DELETE FROM document_aliases")
            self.store.db.execute("UPDATE documents SET content_hash=?", (legacy_hash,))
        self.publish(key)
        self.store.db.close()
        self.store = Store(self.directory.name)
        self.assertEqual(self.aliases(), {"registry:europepmc:MED:123": key, "doi:10.1234/test": key})
        self.assertEqual(self.store.public_milestones("2026-08"), [])
        self.assertEqual(self.store.ingest_documents([item], self.run)["unchanged"], 1)


if __name__ == "__main__":
    unittest.main()
