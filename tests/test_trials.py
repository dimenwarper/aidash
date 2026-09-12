"""The registry supplies trial facts, not AI-design eligibility or proof of benefit."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from aidash.sources.trials import (API, collect_trials, dashboard_trials, load_outcomes,
                                  normalize_study, refresh_trials)
from aidash.store import digest

PROGRAM = {"id":"example","aliases":["AI-123","AI123 tablet"],"trial_ids":["NCT00000001"]}
CATALOGUE = {"programs":[PROGRAM]}
OUTCOME = {
    "trial_id": "NCT00000001", "program_id": "example", "date": "2026-09-02",
    "outcome": "primary_efficacy_met",
    "sources": [{"title": "Trial results", "url": "https://example.org/results"}],
}


def study(nct="NCT00000001", name="AI-123", start="2026-08-01", kind="ACTUAL"):
    return {"protocolSection":{
        "identificationModule":{"nctId":nct,"briefTitle":"Example trial"},
        "designModule":{"studyType":"INTERVENTIONAL","phases":["PHASE1","PHASE2"]},
        "statusModule":{"overallStatus":"TERMINATED","startDateStruct":{"date":start,"type":kind},
                        "lastUpdatePostDateStruct":{"date":"2026-09-01"},"whyStopped":"Example reason"},
        "armsInterventionsModule":{"interventions":[{"type":"DRUG","name":name}]}
    }}


class RegistryTests(unittest.TestCase):
    def test_exact_molecule_matches_and_other_uses_of_ai_do_not(self):
        self.assertIsNotNone(normalize_study(study(name="AI123"), PROGRAM))
        self.assertIsNotNone(normalize_study(study(name="AI123 tablet"), PROGRAM))
        self.assertIsNone(normalize_study(study(name="AI-1234"), PROGRAM))
        other = study()
        other['protocolSection']['armsInterventionsModule']['interventions'][0]['type'] = 'DEVICE'
        self.assertIsNone(normalize_study(other, PROGRAM))
        other = study()
        other['protocolSection']['designModule']['studyType'] = 'OBSERVATIONAL'
        self.assertIsNone(normalize_study(other, PROGRAM))

    def test_actual_estimated_partial_dates_and_combined_phases_are_preserved(self):
        result = normalize_study(study(start='2026-08',kind='ESTIMATED'), PROGRAM)
        self.assertEqual(result['start_date'],'2026-08')
        self.assertEqual(result['start_type'],'ESTIMATED')
        self.assertEqual(result['phases'],['PHASE1','PHASE2'])
        self.assertEqual(result['status'],'TERMINATED')
        for date in ['2026-99','2026-02-30','yesterday']:
            with self.subTest(date=date), self.assertRaises(ValueError):
                normalize_study(study(start=date),PROGRAM)

    def test_paginated_results_are_deduplicated_and_seeded_ids_backfill_search(self):
        fetch=Mock(side_effect=[json.dumps({'studies':[study('NCT00000002')], 'nextPageToken':'second'}),
                                json.dumps({'studies':[study('NCT00000002')]}), json.dumps(study())])
        result=collect_trials(fetch,CATALOGUE)
        self.assertEqual([item['id'] for item in result['trials']],['NCT00000001','NCT00000002'])
        self.assertIn('pageToken=second',fetch.call_args_list[1].args[0])
        self.assertTrue(fetch.call_args_list[2].args[0].endswith('NCT00000001'))

    def test_explicit_scope_fetches_only_named_trials_and_rejects_other_trials(self):
        program = {**PROGRAM, "trial_scope": "explicit",
                   "trial_ids": ["NCT00000001", "NCT00000002"],
                   "ai_categories": ["repurposing"]}
        fetch = Mock(side_effect=[json.dumps(study()), json.dumps(study("NCT00000002"))])
        result = collect_trials(fetch, {"programs": [program]})
        self.assertEqual([call.args[0] for call in fetch.call_args_list],
                         [API + "/NCT00000001", API + "/NCT00000002"])
        self.assertEqual([trial["id"] for trial in result["trials"]], program["trial_ids"])
        self.assertEqual(result["searches"],
                         [{"program_id": "example", "query": None, "scope": "explicit"}])
        self.assertIsNone(normalize_study(study("NCT00000003"), program))
        with self.assertRaisesRegex(ValueError, "does not match"):
            collect_trials(Mock(return_value=json.dumps(study("NCT00000003"))),
                           {"programs": [program]})

    def test_overlapping_categories_and_trial_specific_roles_are_preserved(self):
        categories = ["molecular_design", "target_selection"]
        program = {**PROGRAM, "ai_categories": categories}
        self.assertEqual(normalize_study(study(), program)["ai_categories"], categories)
        program["trial_roles"] = {"NCT00000001": {
            "ai_categories": ["repurposing", "trial_analysis"],
            "scope_note": "Only this treatment comparison is in scope.",
        }}
        result = normalize_study(study(), program)
        self.assertEqual(result["ai_categories"], ["repurposing", "trial_analysis"])
        self.assertEqual(result["scope_note"], "Only this treatment comparison is in scope.")
        self.assertEqual(program["ai_categories"], categories)

    def test_ai_coverage_uses_latest_relevant_date_without_changing_registry_start(self):
        scenarios = [
            ("2024-01-01", "2024-03-01", "2024-06-01", "2024-06-01"),
            ("2024-01-01", "2024-06-01", "2024-03-01", "2024-06-01"),
            ("2024-06-01", "2024-03-01", "2024-01-01", "2024-06-01"),
            ("2024-01", None, "2024-02-15", "2024-02-15"),
            ("2024-01-01", None, None, "2024-01-01"),
            (None, None, None, None),
        ]
        for start, comparison, analysis, expected in scenarios:
            for kind in ["ACTUAL", "ESTIMATED"]:
                with self.subTest(start=start, comparison=comparison, analysis=analysis, kind=kind):
                    role = {"comparison_start_date": comparison,
                            "ai_first_report_date": analysis}
                    program = {**PROGRAM, "ai_categories": ["trial_analysis"],
                               "trial_roles": {"NCT00000001": role}}
                    result = normalize_study(study(start=start, kind=kind), program)
                    self.assertEqual(result["coverage_date"], expected)
                    self.assertEqual(result["start_date"], start)
                    self.assertEqual(result["start_type"], kind)
                    self.assertEqual(result["comparison_start_date"], comparison)
                    self.assertEqual(result["ai_first_report_date"], analysis)
        program = {**PROGRAM, "ai_first_report_date": "2026-09-01"}
        self.assertEqual(normalize_study(study(), program)["coverage_date"], "2026-09-01")

    def test_invalid_categories_fail_in_program_and_trial_role(self):
        for categories in [[], None, ["unverified"], ["molecular_design", "unverified"]]:
            for specific in [False, True]:
                with self.subTest(categories=categories, trial_specific=specific):
                    program = copy.deepcopy(PROGRAM)
                    if specific:
                        program["trial_roles"] = {"NCT00000001": {"ai_categories": categories}}
                    else:
                        program["ai_categories"] = categories
                    with self.assertRaisesRegex(ValueError, "AI-use category"):
                        normalize_study(study(), program)

    def test_mismatched_seed_and_cursor_loop_fail_visibly(self):
        with self.assertRaisesRegex(ValueError,'does not match'):
            collect_trials(Mock(side_effect=[json.dumps({'studies':[]}),json.dumps(study(name='unrelated'))]),CATALOGUE)
        with self.assertRaisesRegex(ValueError,'page token'):
            collect_trials(Mock(return_value=json.dumps({'studies':[study()],'nextPageToken':'loop'})),CATALOGUE)

    def test_partial_query_cannot_be_saved_as_a_complete_count(self):
        with self.assertRaisesRegex(ValueError,'page cap'):
            collect_trials(Mock(return_value=json.dumps({'studies':[study()],'nextPageToken':'next'})),CATALOGUE,max_pages=1)
        with self.assertRaisesRegex(ValueError,'study list'):
            collect_trials(Mock(return_value='{"error":"bad"}'),CATALOGUE)

    def test_snapshot_failures_preserve_data_and_revisions_do_not_double_count(self):
        with tempfile.TemporaryDirectory() as directory:
            store=SimpleNamespace(root=Path(directory))
            first={'fetched_at':'2026-09-01T00:00:00Z','catalogue_hash':digest(CATALOGUE),
                   'trials':[normalize_study(study(),PROGRAM)],'searches':[{'program_id':'example'}]}
            with patch('aidash.sources.trials.collect_trials',return_value=first):
                refresh_trials(store,Mock())
            path=store.root/'clinical_trials.json'
            before=path.read_bytes()
            with patch('aidash.sources.trials.collect_trials',side_effect=RuntimeError('Network failed')):
                with self.assertRaises(RuntimeError):
                    refresh_trials(store,Mock())
            self.assertEqual(path.read_bytes(),before)
            second=copy.deepcopy(first)
            second['trials'][0]['start_date']='2026-07-01'
            with patch('aidash.sources.trials.collect_trials',return_value=second):
                result=refresh_trials(store,Mock())
            self.assertEqual(result['revised_trials'],['NCT00000001'])
            self.assertEqual(len(json.loads(path.read_text())['trials']),1)
            self.assertEqual(len(list((store.root/'trial_snapshots').glob('*.json'))),2)
            with patch('aidash.sources.trials.load_catalogue',return_value=CATALOGUE):
                self.assertTrue(dashboard_trials(store)['available'])
            with patch('aidash.sources.trials.load_catalogue',return_value={'programs':[]}):
                payload=dashboard_trials(store)
                self.assertFalse(payload['available'])
                self.assertEqual(payload['trials'],[])

    def test_outcomes_require_matching_refreshed_trial_and_program(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SimpleNamespace(root=Path(directory))
            snapshot = {
                "fetched_at": "2026-09-01T00:00:00Z", "catalogue_hash": digest(CATALOGUE),
                "trials": [normalize_study(study(), PROGRAM)],
            }
            (store.root / "clinical_trials.json").write_text(json.dumps(snapshot))
            reviewed = {"reviewed_at": "2026-09-03", "outcomes": [
                OUTCOME, {**OUTCOME, "trial_id": "NCT00000002"},
                {**OUTCOME, "program_id": "different_drug"},
            ]}
            with patch('aidash.sources.trials.load_outcomes', return_value=reviewed):
                with patch('aidash.sources.trials.load_catalogue', return_value=CATALOGUE):
                    payload = dashboard_trials(store)
                    self.assertEqual(payload["outcomes"], [OUTCOME])
                    self.assertEqual(payload["outcomes_reviewed_at"], "2026-09-03")
                changed = {"programs": [{**PROGRAM, "ai_categories": ["repurposing"]}]}
                with patch('aidash.sources.trials.load_catalogue', return_value=changed):
                    payload = dashboard_trials(store)
                    self.assertFalse(payload["available"])
                    self.assertEqual(payload["trials"], [])
                    self.assertEqual(payload["outcomes"], [])
                (store.root / "clinical_trials.json").unlink()
                with patch('aidash.sources.trials.load_catalogue', return_value=CATALOGUE):
                    payload = dashboard_trials(store)
                    self.assertFalse(payload["available"])
                    self.assertEqual(payload["outcomes"], [])

    def test_outcome_catalogue_requires_valid_sourced_unique_results(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "trial-outcomes.json"
            reviewed = {"reviewed_at": "2026-09-03", "outcomes": [OUTCOME]}
            with patch('aidash.sources.trials.OUTCOMES', path):
                path.write_text(json.dumps(reviewed))
                self.assertEqual(load_outcomes(), reviewed)
                invalid_records = [
                    [{**OUTCOME, "sources": []}],
                    [{**OUTCOME, "sources": [{"url": "http://example.org/results"}]}],
                    [{**OUTCOME, "trial_id": "not-a-registry-ID"}],
                    [{**OUTCOME, "outcome": "completed"}],
                    [{**OUTCOME, "date": "2026-02-30"}],
                    [OUTCOME, copy.deepcopy(OUTCOME)],
                ]
                for records in invalid_records:
                    with self.subTest(records=records):
                        path.write_text(json.dumps({**reviewed, "outcomes": records}))
                        with self.assertRaises(ValueError):
                            load_outcomes()

    def test_dashboard_does_not_export_outcomes_without_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            store = SimpleNamespace(root=Path(directory))
            snapshot = {"fetched_at": "2026-09-01T00:00:00Z",
                        "catalogue_hash": digest(CATALOGUE),
                        "trials": [normalize_study(study(), PROGRAM)]}
            (store.root / "clinical_trials.json").write_text(json.dumps(snapshot))
            outcomes = store.root / "trial-outcomes.json"
            outcomes.write_text(json.dumps({"reviewed_at": "2026-09-03",
                                           "outcomes": [{**OUTCOME, "sources": []}]}))
            with patch('aidash.sources.trials.load_catalogue', return_value=CATALOGUE), \
                    patch('aidash.sources.trials.OUTCOMES', outcomes):
                with self.assertRaisesRegex(ValueError, "source evidence"):
                    dashboard_trials(store)


if __name__ == '__main__':
    unittest.main()
