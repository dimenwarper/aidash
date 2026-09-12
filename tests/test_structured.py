import unittest
from pathlib import Path

from aidash.sources.structured import (
    FDA_URL, INDEED_CSV_URL, SourceSchemaError, fetch_fda, fetch_indeed,
)


FIXTURES = Path(__file__).parent / "fixtures"


class StructuredSourceTests(unittest.TestCase):
    def setUp(self):
        self.indeed = (FIXTURES / "structured_indeed.csv").read_bytes()
        self.fda = (FIXTURES / "structured_fda.html").read_bytes()

    def test_indeed_preserves_percentage_units_and_countries(self):
        requested = []

        def fetch(url):
            requested.append(url)
            return self.indeed

        rows = fetch_indeed(fetch)
        self.assertEqual(requested, [INDEED_CSV_URL])
        self.assertEqual(len(rows), 4)
        us = [row for row in rows if row["geography"] == "US"]
        self.assertEqual([row["value"] for row in us], [4.25, 4.5])
        self.assertEqual(us[0]["period"], "2026-01-31")
        self.assertEqual(us[0]["frequency"], "daily")
        self.assertEqual(us[0]["unit"], "percent")

    def test_indeed_rejects_invalid_percent_and_dates(self):
        for old, new in [(b"4.25", b"nan"), (b"4.25", b"inf"), (b"4.25", b"101"),
                         (b"4.25", b"-1"), (b"4.25", b"4.25%"), (b"4.25", b""),
                         (b"2026-01-31", b"2026-02-30"), (b",US,", b",USA,")]:
            with self.subTest(new=new), self.assertRaises(SourceSchemaError):
                fetch_indeed(lambda _: self.indeed.replace(old, new))

    def test_indeed_rejects_schema_drift_empty_and_duplicate_data(self):
        for data in [b"", self.indeed.splitlines()[0] + b"\n",
                     self.indeed.replace(b"AI_share_postings", b"AI_fraction"),
                     self.indeed + b"2026-01-31,US,4.25\n",
                     self.indeed.replace(b"US,4.25", b"US,4.25,extra")]:
            with self.subTest(data=data[:80]), self.assertRaises(SourceSchemaError):
                fetch_indeed(lambda _: data)

    def test_fda_counts_unique_submissions_by_month_and_panel(self):
        requested = []

        def fetch(url):
            requested.append(url)
            return self.fda

        rows = fetch_fda(fetch)
        self.assertEqual(requested, [FDA_URL])
        self.assertEqual(len(rows), 5)
        total = [row for row in rows if row["dimensions"] == {}]
        self.assertEqual([(row["period"], row["value"]) for row in total],
                         [("2026-01-01", 2), ("2026-03-01", 1)])
        january = [row for row in rows if row["period"] == "2026-01-01" and row["dimensions"]]
        self.assertEqual({row["dimensions"]["specialty"]: row["value"] for row in january},
                         {"Cardiovascular": 1, "Radiology": 1})
        self.assertTrue(all(row["geography"] == "US" and row["unit"] == "count" for row in rows))

    def test_fda_leaves_unseen_months_and_specialties_absent(self):
        rows = fetch_fda(lambda _: self.fda)
        self.assertFalse(any(row["period"] == "2026-02-01" for row in rows))
        self.assertFalse(any(row["period"] > "2026-03-01" for row in rows))
        self.assertFalse(any(row["period"] == "2026-03-01" and row["dimensions"] == {"specialty": "Cardiovascular"}
                             for row in rows))

    def test_fda_fails_on_changed_schema_empty_or_malformed_data(self):
        for data in [b"<html>Access denied</html>",
                     self.fda.replace(b"Panel (Lead)", b"New Panel"),
                     self.fda.replace(b"03/04/2026", b"13/04/2026"),
                     self.fda.replace(b"K260003", b"K260002"),
                     self.fda.replace(b"<td>QIH</td>", b""),
                     self.fda.replace(b"<td>Radiology</td>", b"<td></td>"),
                     self.fda[:self.fda.index(b"</tbody>")],
                     self.fda[:self.fda.index(b"<tbody>")] + b"<tbody></tbody></table>"]:
            with self.subTest(data=data[:80]), self.assertRaises(SourceSchemaError):
                fetch_fda(lambda _: data)


if __name__ == "__main__":
    unittest.main()
