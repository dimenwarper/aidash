"""News discovery must remain separate from reviewed mathematical-result counts."""
import copy
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from aidash.sources.math_news import discover_math_news, refresh_math_news, load_math_results, QUERIES


def feed(link='https://news.google.com/rss/articles/example',day='Tue, 08 Sep 2026 12:00:00 GMT'):
    return ('<rss><channel><item><title>AI mathematics result</title><link>'+link+'</link>'
            '<pubDate>'+day+'</pubDate><source>Example News</source></item></channel></rss>').encode()


class MathNewsTests(unittest.TestCase):
    def test_overlapping_queries_deduplicate_headlines_and_mark_them_unreviewed(self):
        fetch=Mock(return_value=feed())
        result=discover_math_news(fetch,'2026-09-01','2026-09-12')
        self.assertEqual(len(result['entries']),1)
        self.assertEqual(result['entries'][0]['status'],'unreviewed')
        self.assertEqual(fetch.call_count,len(QUERIES))
        self.assertIn('before%3A2026-09-13',fetch.call_args.args[0])
        self.assertNotIn('proof',result['entries'][0])

    def test_date_boundaries_unsafe_links_and_invalid_dates(self):
        self.assertEqual(discover_math_news(Mock(return_value=feed()),'2026-08-01','2026-08-31')['entries'],[])
        bad=discover_math_news(Mock(return_value=feed(link='javascript:alert(1)')),'2026-09-01','2026-09-12')
        self.assertEqual(bad['entries'],[])
        self.assertGreater(bad['skipped'],0)
        bad=discover_math_news(Mock(return_value=feed(day='invalid')),'2026-09-01','2026-09-12')
        self.assertEqual(bad['entries'],[])
        with self.assertRaises(ValueError):
            discover_math_news(Mock(return_value=b'<html/>'),'2026-09-01','2026-09-12')

    def test_failed_search_preserves_queue_and_does_not_modify_result_catalogue(self):
        catalogue=load_math_results()
        with tempfile.TemporaryDirectory() as directory:
            store=SimpleNamespace(root=Path(directory))
            result=refresh_math_news(store,Mock(return_value=feed()),'2026-09-01','2026-09-12')
            self.assertEqual(result['added'],1)
            path=store.root/'math_news_candidates.json'
            before=path.read_bytes()
            with self.assertRaises(RuntimeError):
                refresh_math_news(store,Mock(side_effect=[feed(),RuntimeError('network failure')]),'2026-09-01','2026-09-12')
            self.assertEqual(path.read_bytes(),before)
            result=refresh_math_news(store,Mock(return_value=feed()),'2026-09-01','2026-09-12')
            self.assertEqual(result['added'],0)
        self.assertEqual(load_math_results(),catalogue)

    def test_public_result_requires_news_and_primary_evidence_and_new_mathematics(self):
        original=load_math_results()
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'catalogue.json'
            for change in ('duplicate','formalization','missing_evidence'):
                value=copy.deepcopy(original)
                if change=='duplicate': value['records'].append(value['records'][0])
                if change=='formalization': value['records'][0]['category']='formalization'
                if change=='missing_evidence': value['records'][0]['primary_sources']=[]
                path.write_text(json.dumps(value))
                with patch('aidash.sources.math_news.CATALOGUE',path),self.subTest(change=change),self.assertRaises(ValueError):
                    load_math_results()
        riemann=next(row for row in original['records'] if row['id']=='riemann-critical-line-2026')
        self.assertEqual(riemann['category'],'advance')
        self.assertIn('remains unsolved',riemann['caveat'])


if __name__=='__main__':
    unittest.main()
