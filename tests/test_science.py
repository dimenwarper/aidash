"""Offline adapter checks using synthetic records, never claims of real discoveries."""

import copy
import json
from pathlib import Path
import unittest
from urllib.parse import parse_qs, urlparse

from aidash.sources.science import discover, normalize_doi, SEARCH_QUERY


FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


class FetchPages:
    def __init__(self, *pages):
        self.pages = list(pages)
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        if not self.pages:
            raise AssertionError("adapter fetched more pages than expected")
        return json.dumps(self.pages.pop(0)).encode()


class ScienceTests(unittest.TestCase):
    def test_paginated_discovery_normalizes_without_making_milestone_claims(self):
        fetch = FetchPages(fixture("science_page1.json"), fixture("science_page2.json"))
        result = discover(fetch, "2026-08-01", "2026-08-31", page_size=2)
        self.assertTrue(result["complete"])
        self.assertEqual(result["reported_total"], 3)
        self.assertEqual(len(result["documents"]), 3)
        self.assertEqual(result["query"], SEARCH_QUERY + " AND FIRST_PDATE:[2026-08-01 TO 2026-08-31]")
        params = [parse_qs(urlparse(url).query) for url in fetch.urls]
        self.assertEqual(params[0]["cursorMark"], ["*"])
        self.assertEqual(params[1]["cursorMark"], ["cursor+page/2="])
        self.assertEqual(params[0]["resultType"], ["core"])
        first, preprint, last = result["documents"]
        self.assertEqual(first["external_id"], "MED:900001")
        self.assertEqual(first["title"], "AI-assisted protein design & validation")
        self.assertEqual(first["abstract"], "Background Synthetic fixture abstract. Experimental confirmation.")
        self.assertEqual(first["doi"], "10.1234/example.a")
        self.assertEqual(first["url"], "https://doi.org/10.1234/example.a")
        self.assertEqual(first["metadata"]["rights"]["license"], "cc-by")
        self.assertEqual(first["metadata"]["review_status"], "unreviewed")
        self.assertIn("original precision unknown", first["metadata"]["date_precision"])
        self.assertEqual(preprint["metadata"]["publication_types"], ["Preprint"])
        self.assertEqual(preprint["abstract"], "")
        self.assertEqual(preprint["url"], "https://europepmc.org/article/PPR/PPR900002")
        self.assertIsNone(last["doi"])
        self.assertIsNone(last["metadata"]["rights"]["is_open_access"])

    def test_bounded_run_reports_partial_coverage(self):
        fetch = FetchPages(fixture("science_page1.json"))
        result = discover(fetch, "2026-08-01", "2026-08-31", max_pages=1, page_size=2)
        self.assertFalse(result["complete"])
        self.assertIn("max_pages_reached", result["warnings"])
        self.assertEqual(result["pages_fetched"], 1)

    def test_cursor_cycle_and_repeated_page_are_not_complete(self):
        for next_cursor, expected in [("*", "cursor_loop"), ("another", "repeated_page")]:
            with self.subTest(cursor=next_cursor):
                first = fixture("science_page1.json")
                second = copy.deepcopy(first)
                second["nextCursorMark"] = next_cursor
                fetch = FetchPages(first, second)
                result = discover(fetch, "2026-08-01", "2026-08-31", max_pages=5)
                self.assertFalse(result["complete"])
                self.assertTrue(any(expected in warning for warning in result["warnings"]))
                self.assertEqual(len(fetch.urls), 2)
                self.assertEqual(len(result["documents"]), 2)

    def test_missing_or_partial_dates_are_never_invented_and_window_is_inclusive(self):
        page = fixture("science_page1.json")
        original = page["resultList"]["result"][0]
        dates = [None, "2026", "2026-08", "2026-08-00", "2026-02-30", "2026-07-31", "2026-09-01"]
        for index, date in enumerate(dates):
            record = copy.deepcopy(original)
            record.update(id=str(index), firstPublicationDate=date)
            page["resultList"]["result"].append(record)
        page["hitCount"] = len(page["resultList"]["result"])
        result = discover(FetchPages(page), "2026-08-01", "2026-08-31")
        self.assertFalse(result["complete"])
        self.assertEqual(result["rejected_records"], len(dates))
        self.assertEqual([d["published_at"] for d in result["documents"]], ["2026-08-01", "2026-08-31"])

    def test_missing_id_or_title_is_flagged(self):
        page = fixture("science_page1.json")
        del page["resultList"]["result"][0]["id"]
        del page["resultList"]["result"][1]["title"]
        page.pop("nextCursorMark")
        result = discover(FetchPages(page), "2026-08-01", "2026-08-31")
        self.assertFalse(result["complete"])
        self.assertEqual(result["rejected_records"], 2)
        self.assertEqual(result["documents"], [])

    def test_empty_results_and_premature_empty_pages_are_distinct(self):
        for count in [0, 20]:
            with self.subTest(count=count):
                result = discover(FetchPages({"hitCount": count, "resultList": {"result": []}}),
                                  "2026-08-01", "2026-08-31")
                self.assertEqual(result["complete"], count == 0)
                self.assertEqual(result["documents"], [])

    def test_hit_count_changes_are_flagged(self):
        first, second = fixture("science_page1.json"), fixture("science_page2.json")
        second["hitCount"] = 2
        result = discover(FetchPages(first, second), "2026-08-01", "2026-08-31")
        self.assertEqual(result["reported_total"], 3)
        self.assertFalse(result["complete"])
        self.assertIn("reported_total_changed", result["warnings"])

    def test_inconsistent_total_is_not_complete(self):
        page = fixture("science_page1.json")
        page["hitCount"] = 0
        result = discover(FetchPages(page), "2026-08-01", "2026-08-31")
        self.assertFalse(result["complete"])
        self.assertIn("received_more_unique_records_than_reported_total", result["warnings"])

    def test_malformed_payload_raises_instead_of_publishing_empty_success(self):
        for payload in [{"error": "unavailable"}, [], {"hitCount": "0", "resultList": {"result": []}},
                        {"hitCount": 0, "resultList": {"result": {}}}]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                discover(FetchPages(payload), "2026-08-01", "2026-08-31")

    def test_parameter_validation_happens_before_fetch(self):
        fetch = FetchPages()
        for start, end, options in [
            ("2026-08", "2026-08-31", {}), ("2026-08-31", "2026-08-01", {}),
            ("2026-08-01", "2026-08-31", {"max_pages": 0}),
            ("2026-08-01", "2026-08-31", {"page_size": 1001}),
            ("2026-08-01", "2026-08-31", {"page_size": True}),
        ]:
            with self.subTest(options=options), self.assertRaises(ValueError):
                discover(fetch, start, end, **options)
        self.assertEqual(fetch.urls, [])

    def test_doi_normalization(self):
        self.assertEqual(normalize_doi(" DOI:10.1234/AbC "), "10.1234/abc")
        self.assertEqual(normalize_doi("http://dx.doi.org/10.1234/AbC"), "10.1234/abc")
        for value in [None, 42, "javascript:bad", "10.1234/a b", "https://example.com/article"]:
            self.assertIsNone(normalize_doi(value))


if __name__ == "__main__":
    unittest.main()
