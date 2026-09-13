import copy
import io
import json
import tempfile
import unittest
import zipfile
from unittest.mock import patch

from aidash.store import Store
from aidash.sources.leading import (ECONOMY, CATALOGUE, parse_fred, validate_series,
                                    refresh_leading, dashboard_leading, contextual_series)
from aidash.sources.leading_feeds import definitions, parse_btos, parse_canaries, metr_frontiers


def series(key='test',points=None,**extra):
    return dict(id=key,name='Synthetic series',group='jobs',unit='index',frequency='monthly',url='https://example.org/data',note='Synthetic definition.',points=points or [['2025-01-31',1]],**extra)


def model(key,day,value,version='v1.1'):
    return f'''  {key}:
    benchmark_name: METR-Horizon-{version}
    release_date: {day}
    metrics:
      p50_horizon_length:
        estimate: {value}
        ci_low: 0.1
        ci_high: 999
      p80_horizon_length:
        estimate: {value/2}
        ci_low: 0.01
        ci_high: 999
'''


class LeadingTests(unittest.TestCase):
    def test_period_ends_and_missing_not_zero(self):
        spec=next(s for s in ECONOMY if s['id']=='labor_productivity')
        rows=[f'{y}-{m:02}-01,{100+i}' for i,(y,m) in enumerate((y,m) for y in range(2022,2025) for m in (1,4,7,10))]
        rows[1]='2022-04-01,.'
        raw=('observation_date,OPHNFB\n'+'\n'.join(rows)).encode()
        result=parse_fred(raw,spec)
        self.assertEqual(result['points'][0],['2022-03-31',100])
        self.assertNotIn('2022-06-30',dict(result['points']))
        with self.assertRaises(ValueError): parse_fred(raw.replace(b'2022-07-01',b'2022-01-01'),spec)
        with self.assertRaises(ValueError): parse_fred(raw.replace(b',100',b',nan'),spec)

    def test_null_revision_and_negative_values_valid_but_duplicates_invalid(self):
        old=series(points=[['2025-01-31',1],['2025-02-28',2]])
        new=series(points=[['2025-01-31',-1],['2025-02-28',None]])
        validate_series([new],[old])
        for value in [True,float('nan'),float('inf')]:
            with self.assertRaises(ValueError):validate_series([series(points=[['2025-01-31',value]])])
        with self.assertRaises(ValueError):validate_series([series(points=[['2025-01-31',1],['2025-01-31',2]])])

    def test_census_boundary_percent_units_nulls_and_facet_selection(self):
        specs=definitions('btos')[:2]
        rows=[dict(Date='2025-11-30',xmltag='Current AI Use (Last Two Weeks)',Estimate=23.2),dict(Date='2025-11-30',xmltag='Expected AI Use (Next Six Months)',Estimate=None)]
        result=parse_btos(json.dumps(rows).encode(),specs)
        self.assertEqual(result[0]['points'],[['2025-11-30',23.2]])
        self.assertEqual(result[1]['points'],[['2025-11-30',None]])
        rows[0]['Date']='2025-11-16'
        with self.assertRaises(ValueError):parse_btos(json.dumps(rows).encode(),specs)
        rows[0]['Date']='2025-11-30';rows[0]['xmltag']='Different wording'
        with self.assertRaises(ValueError):parse_btos(json.dumps(rows).encode(),specs)

    def test_metr_version_duplicate_dates_cis_and_truncation(self):
        raw=('results:\n'+model('old','2022-01-01',500,'v1.0')+model('a','2023-01-01',1)+model('b','2024-01-01',2)+model('same_day','2024-01-01',3)+model('c','2025-01-01',5)+model('d','2026-01-01',4)).encode()
        specs=definitions('metr')
        first=metr_frontiers(raw,specs)
        self.assertEqual(first[0]['points'],[['2023-01-01',1],['2024-01-01',3],['2025-01-01',5]])
        self.assertNotIn('old',first[0]['model_coverage'])
        revised=metr_frontiers(raw.replace(b'estimate: 5\n',b'estimate: 2.5\n'),specs)
        validate_series(revised,first) # Membership can change when same models are re-evaluated.
        truncated=metr_frontiers(raw[:raw.index(b'  d:')],specs)
        with self.assertRaisesRegex(ValueError,'coverage'):validate_series(truncated,first)
        with self.assertRaises(ValueError):metr_frontiers(raw.replace(b'ci_high: 999',b'ci_high: 0'),specs)

    def test_canaries_coherent_rolling_vintage(self):
        from aidash.sources.leading_feeds import month_end
        dates=[month_end(f'{2021+i//12}-{i%12+1:02}-01') for i in range(61)]
        old=series('canaries_test',[[d,100] for d in dates[:60]],published_at='2026-02-01')
        new=series('canaries_test',[[d,101] for d in dates[1:]],published_at='2026-03-01')
        validate_series([new],[old])
        self.assertNotIn(dates[0],dict(new['points'])) # No incompatible old-sample prefix appended.
        with self.assertRaises(ValueError):validate_series([{**new,'points':new['points'][-5:]}],[old])
        spec=definitions('canaries')[0];rows=['observation_date,exposure_quintile,vintage,'+spec['age_column']]
        for d in dates[:60]:rows.append(f'{d[:7]}-01,Quintile 1 (least exposed),2026-02-01,100')
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as archive:archive.writestr('canaries_age_by_exposure.csv','\n'.join(rows))
        parsed=parse_canaries(buf.getvalue(),[spec])[0]
        self.assertEqual(len(parsed['points']),60)
        self.assertEqual(parsed['points'][0][0],'2021-01-31')

    def test_failed_refresh_preserves_last_good_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory)
            with patch('aidash.sources.leading.fetch_economy',return_value=[series()]):refresh_leading(store,None,'leading-economy')
            path=store.root/'leading'/'leading-economy.json';before=path.read_bytes()
            with patch('aidash.sources.leading.fetch_economy',return_value=[series(points=[['2025-02-28',2]])]):
                with self.assertRaises(ValueError):refresh_leading(store,None,'leading-economy')
            self.assertEqual(path.read_bytes(),before)
            run=store.start_run('leading-economy');store.finish_run(run,'failed',{'error':'internal diagnostic'})
            exported=dashboard_leading(store)
            self.assertEqual(exported['series']['test']['points'],[['2025-01-31',1]])
            self.assertEqual(exported['sources'][0]['status'],'failed')
            self.assertNotIn('internal diagnostic',json.dumps(exported))
            store.db.close()

    def test_science_eligibility_late_ai_disclosure_and_result_reversal(self):
        trials={'available':True,'trials':[
            dict(id='a',program_id='p',start_type='ACTUAL',start_date='2020-01-01',coverage_date='2023-01-01',phases=['PHASE2']),
            dict(id='b',program_id='p',start_type='ESTIMATED',start_date='2020-01-01',phases=['PHASE3'])],
            'outcomes':[dict(trial_id='a',program_id='p',date='2021-01-01',endpoint_type='efficacy',outcome='primary_efficacy_met'),dict(trial_id='a',program_id='p',date='2024-01-01',endpoint_type='efficacy',outcome='mixed')]}
        result={s['id']:s for s in contextual_series({'trials':trials})}
        self.assertEqual(result['phase23_trials']['points'],[['2023-01-01',1]])
        self.assertEqual(result['efficacy_trials']['points'],[['2023-01-01',1],['2024-01-01',0]])

    def test_reviewed_catalogue_evidence_and_no_forecasts_masquerading_as_actuals(self):
        catalog=json.loads(CATALOGUE.read_text());validate_series(catalog['series'])
        for item in catalog['series']:
            if item['id'].startswith(('asml','a3','dominion')):
                details={e['date']:e for e in item['point_details']}
                for day,value in item['points']:
                    self.assertTrue(details[day]['url'].startswith('https://'))
                    self.assertEqual(details[day]['value'],value)
        bookings=next(s for s in catalog['series'] if s['id']=='asml-net-bookings')
        self.assertEqual(bookings['points'][-1][0],'2025-12-31')
        self.assertIn('ended',bookings['alert'])
