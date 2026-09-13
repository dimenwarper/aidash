import contextlib
import copy
import hashlib
import io
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import urlparse

from aidash.__main__ import parser, refresh
from aidash.sources.leading import (CATALOGUE, SOURCES, dashboard_leading,
                                    refresh_leading, validate_series)
from aidash.sources.sentiment import validate_surveys
from aidash.store import Store


SURVEY_CATALOGUE = CATALOGUE.with_name('sentiment.json')


def catalogue():
    return json.loads(SURVEY_CATALOGUE.read_text())


def sample():
    return copy.deepcopy(catalogue()['series'][0])


@contextlib.contextmanager
def temporary_catalogue(items):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        reviewed = root / 'sentiment.json'
        reviewed.write_text(json.dumps({'series': items}))
        store = Store(root / 'data')
        try:
            with patch('aidash.sources.leading.CATALOGUE', root / 'leading-indicators.json'):
                yield store, reviewed
        finally:
            store.db.close()


class SentimentTests(unittest.TestCase):
    def test_reviewed_waves_retain_primary_evidence_population_and_dates(self):
        data = catalogue()
        validate_series(data['series'])
        validate_surveys(data['series'])
        self.assertEqual({s['survey_family'] for s in data['series'] if s.get('topic')!='data-centers'}, {'pew', 'ipsos'})
        for item in data['series']:
            with self.subTest(series=item['id']):
                self.assertEqual(item['mode'], 'Reviewed snapshot')
                self.assertEqual(item['frequency'], 'survey')
                self.assertEqual(len(item['points']), len(item['point_details']))
                evidence = {entry['date']: entry for entry in item['point_details']}
                for day, value in item['points']:
                    entry = evidence[day]
                    self.assertEqual(value, entry['value'])
                    self.assertEqual(day, entry['fieldwork_end'])
                    self.assertLessEqual(entry['fieldwork_start'], day)
                    self.assertLessEqual(day, entry['published_at'])
                    self.assertLessEqual(entry['published_at'], data['reviewed_at'])
                    for field in ('url', 'methodology_url'):
                        parsed = urlparse(entry[field])
                        self.assertEqual(parsed.scheme, 'https')
                        self.assertIn(parsed.hostname,
                                      ('www.pewresearch.org', 'www.ipsos.com', 'resources.ipsos.com', 'news.gallup.com', 'www.annenbergpublicpolicycenter.org'))
                    self.assertTrue(entry['methodology'].strip())
                    self.assertTrue(entry['population'].strip())
                    self.assertGreater(entry.get('sample_size', entry.get('sample_size_approx', 0)), 0)

    def test_china_missing_waves_are_absent_and_not_interpolated(self):
        china = [s for s in catalogue()['series'] if s.get('market') == 'CN']
        self.assertEqual({s['metric'] for s in china}, {'excited', 'nervous', 'benefits', 'data_trust'})
        for item in china:
            self.assertEqual([day for day, _ in item['points']], ['2024-05-03', '2026-04-03'])
            self.assertEqual(item['missing_years'], [2023, 2025])
            days = [date.fromisoformat(day) for day, _ in item['points']]
            self.assertGreater((days[1] - days[0]).days, item['max_gap_days'])
            self.assertIn('connected', item['note'])
            self.assertIn('no 2023 or 2025 wave', item['alert'])

    def test_latest_report_vintage_and_question_changes_are_explicit(self):
        by_id = {s['id']: s for s in catalogue()['series']}
        ipsos = by_id['ipsos_us_nervous']
        prior = next(e for e in ipsos['point_details'] if e['wave_year'] == 2025)
        self.assertEqual(prior['value'], 64)  # 2026 table, not 65 from the initial 2025 release.
        self.assertEqual(prior['first_published_at'], '2025-06-05')
        self.assertEqual(prior['published_at'], '2026-06-02')
        self.assertIn('may differ', prior['vintage_note'])
        pew = by_id['pew_us_concerned']
        self.assertEqual({b['date'] for b in pew['breaks']}, {'2022-12-18', '2024-08-18'})
        self.assertIn('telephone', pew['alert'])
        # Concern and excitement are not complements in either survey family.
        self.assertNotEqual(by_id['ipsos_us_excited']['points'][-1][1] + ipsos['points'][-1][1], 100)
        self.assertIn('overlap', ipsos['note'])

    def test_percentage_boundaries_valid_but_invalid_values_rejected(self):
        for value in (0, 100):
            item = sample()
            item['points'][0][1] = item['point_details'][0]['value'] = value
            validate_surveys([item])
        for value in (-0.1, 100.1, True, None, '50', float('nan'), float('inf')):
            with self.subTest(value=value):
                item = sample()
                item['points'][0][1] = item['point_details'][0]['value'] = value
                with self.assertRaisesRegex(ValueError, 'percentage'):
                    validate_surveys([item])

    def test_missing_mismatched_duplicate_and_extra_evidence_rejected(self):
        mutations = {
            'missing': lambda s: s['point_details'].pop(),
            'mismatched value': lambda s: s['point_details'][0].update(value=1),
            'duplicate': lambda s: s['point_details'].append(copy.deepcopy(s['point_details'][0])),
            'extra wave': lambda s: s['point_details'].append({**s['point_details'][0], 'date': '2020-01-01'}),
        }
        for name, mutate in mutations.items():
            with self.subTest(case=name):
                item = sample()
                mutate(item)
                with self.assertRaises(ValueError):
                    validate_surveys([item])

    def test_invalid_dates_chronology_and_observation_date_rejected(self):
        mutations = {
            'invalid date': lambda s: s['point_details'][0].update(fieldwork_start='2021-02-30'),
            'fieldwork reversed': lambda s: s['point_details'][0].update(fieldwork_start='2021-11-08'),
            'publication before fieldwork': lambda s: s['point_details'][0].update(published_at='2021-11-06'),
            'observation is release date': lambda s: (
                s['points'][0].__setitem__(0, '2022-03-17'),
                s['point_details'][0].update(date='2022-03-17')),
        }
        for name, mutate in mutations.items():
            with self.subTest(case=name):
                item = sample()
                mutate(item)
                with self.assertRaises(ValueError):
                    validate_surveys([item])

    def test_missing_question_population_methodology_and_https_rejected(self):
        for field in ('question', 'population', 'survey_family'):
            item = sample()
            item.pop(field)
            with self.subTest(series_field=field), self.assertRaises(ValueError):
                validate_surveys([item])
        for field, value in (('methodology', ''), ('population', ''), ('url', 'http://example.org')):
            item = sample()
            item['point_details'][0][field] = value
            with self.subTest(wave_field=field), self.assertRaises(ValueError):
                validate_surveys([item])

    def test_import_archives_reviewed_input_and_preserves_export_metadata(self):
        item = sample()
        with temporary_catalogue([item]) as (store, reviewed):
            run = store.start_run('leading-sentiment')
            no_network = Mock(side_effect=AssertionError('Reviewed import must not request network data'))
            result = refresh_leading(store, no_network, 'leading-sentiment', run)
            store.finish_run(run, 'success', result)
            no_network.assert_not_called()
            self.assertIn('require review', result['mode'])
            fetched = store.db.execute('SELECT * FROM fetches WHERE run_id=?', (run,)).fetchone()
            self.assertEqual(fetched['url'], 'catalog:sentiment')
            self.assertEqual(fetched['sha256'], hashlib.sha256(reviewed.read_bytes()).hexdigest())
            self.assertEqual((store.root / fetched['path']).read_bytes(), reviewed.read_bytes())
            exported = dashboard_leading(store)['series'][item['id']]
            for field in ('point_details', 'question', 'population', 'published_at', 'breaks'):
                self.assertEqual(exported[field], item[field])
            self.assertTrue(exported['fetched_at'])

    def test_failed_refresh_keeps_last_good_data_and_failed_status(self):
        item = sample()
        with temporary_catalogue([item]) as (store, reviewed):
            refresh_leading(store, None, 'leading-sentiment')
            path = store.root / 'leading' / 'leading-sentiment.json'
            before = path.read_bytes()
            bad = copy.deepcopy(item)
            bad['points'][-1][1] = 101
            reviewed.write_text(json.dumps({'series': [bad]}))
            args = parser().parse_args(['refresh', '--source', 'leading-sentiment'])
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(refresh(store, args), 1)
            self.assertEqual(json.loads(output.getvalue())[0]['status'], 'failed')
            self.assertEqual(path.read_bytes(), before)
            exported = dashboard_leading(store)
            self.assertEqual(exported['series'][item['id']]['points'], item['points'])
            self.assertEqual(next(s for s in exported['sources'] if s['source'] == 'leading-sentiment')['status'], 'failed')
            # A syntactically valid replacement may not silently remove old waves either.
            truncated = copy.deepcopy(item)
            truncated['points'].pop(0)
            truncated['point_details'].pop(0)
            reviewed.write_text(json.dumps({'series': [truncated]}))
            with self.assertRaisesRegex(ValueError, 'lost history'):
                refresh_leading(store, None, 'leading-sentiment')
            self.assertEqual(path.read_bytes(), before)

    def test_data_centers_keep_population_and_question_scope(self):
        items={s['id']:s for s in catalogue()['series']}
        pew=items['pew_dc_energy_bills_bad']
        self.assertEqual(pew['points'],[['2026-01-26',38]])
        self.assertIn('all U.S. adults',pew['note'])
        self.assertIn('25%',pew['note'])
        self.assertIn('AI, streaming',pew['note'])
        self.assertEqual(items['gallup_dc_oppose']['points'],[['2026-03-18',71]])
        self.assertEqual(items['gallup_dc_favor']['points'],[['2026-03-18',27]])
        self.assertEqual(items['annenberg_dc_local_opposition']['points'],[['2026-03-20',49],['2026-07-19',61]])
        self.assertEqual(items['reuters_ipsos_dc_electricity_cost']['points'],[['2026-06-08',77]])
        self.assertNotEqual(items['ipsos_dc_local_opposition']['survey_family'],items['reuters_ipsos_dc_electricity_cost']['survey_family'])
        for item in [s for s in items.values() if s.get('topic')=='data-centers']:
            self.assertEqual(item['market'],'US')
            self.assertIn('survey',item['frequency'])

    def test_cli_source_and_leading_refresh_group_include_sentiment(self):
        self.assertEqual(parser().parse_args(['refresh']).source, 'all')
        self.assertIn('leading-sentiment', SOURCES)
        args = parser().parse_args(['refresh', '--source', 'leading'])
        with tempfile.TemporaryDirectory() as directory:
            store = Store(directory)
            try:
                with patch('aidash.sources.leading.refresh_leading', return_value={'series': 1}) as importer:
                    with contextlib.redirect_stdout(io.StringIO()):
                        self.assertEqual(refresh(store, args), 0)
                    self.assertEqual([call.args[2] for call in importer.call_args_list], SOURCES)
            finally:
                store.db.close()


if __name__ == '__main__':
    unittest.main()
