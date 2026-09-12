import argparse
from contextlib import redirect_stdout
import io
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from aidash.__main__ import extract_candidates
from aidash.extraction import DEFAULT_MODEL, PROMPT_VERSION
from aidash.store import Store
from tests.test_extraction import RESULT
from tests.test_store_report import document


class ExtractionCliTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(self.tmp.name)
        run = self.store.start_run("science")
        self.store.ingest_documents([document()], run)

    def tearDown(self):
        self.store.db.close()
        self.tmp.cleanup()

    def run_extraction(self, environment, model=None):
        output = io.StringIO()
        with patch.dict(os.environ, environment, clear=True), redirect_stdout(output), \
                patch("aidash.extraction.extract", return_value=RESULT) as request:
            extract_candidates(self.store, argparse.Namespace(model=model, limit=1))
        return request, json.loads(output.getvalue())

    def test_openrouter_key_and_default_model_are_used(self):
        request, output = self.run_extraction({"OPENROUTER_API_KEY": "router-test-key"})
        self.assertEqual(request.call_args.args[1:], (DEFAULT_MODEL, "router-test-key"))
        self.assertEqual(output["provider"], "openrouter")
        self.assertNotIn("router-test-key", json.dumps(output))
        row = self.store.db.execute("SELECT * FROM extractions").fetchone()
        self.assertEqual(row["prompt_version"], PROMPT_VERSION)
        self.assertEqual(row["model"], DEFAULT_MODEL)
        self.assertEqual(self.store.public_milestones("2026-08"), [])

    def test_explicit_model_overrides_router_environment(self):
        request, output = self.run_extraction({"OPENROUTER_API_KEY": "router-test-key",
                                               "OPENROUTER_MODEL": "vendor/environment"}, "vendor/explicit")
        self.assertEqual(request.call_args.args[1], "vendor/explicit")
        self.assertEqual(output["model"], "vendor/explicit")

    def test_environment_model_and_repeat_skip(self):
        environment = {"OPENROUTER_API_KEY": "router-test-key", "OPENROUTER_MODEL": "vendor/environment"}
        request, _ = self.run_extraction(environment)
        self.assertEqual(request.call_args.args[1], "vendor/environment")
        request, output = self.run_extraction(environment)
        request.assert_not_called()
        self.assertEqual(output["extracted"], [])

    def test_openai_key_is_not_sent_as_an_openrouter_key(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "different-provider-key"}, clear=True), \
                patch("aidash.extraction.extract") as request:
            with self.assertRaisesRegex(ValueError, "OPENROUTER_API_KEY"):
                extract_candidates(self.store, argparse.Namespace(model=None, limit=1))
            request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
