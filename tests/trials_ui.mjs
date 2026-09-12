import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Test the shipped calculation and rendering code without a browser dependency.
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {
    textContent: '', innerHTML: '', clientWidth: 640, hidden: false, value: '',
    querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, focus() {},
  });
  return elements.get(id);
};
const chartButtons = ['starts', 'outcomes'].map(trialChart => ({
  dataset: {trialChart}, attributes: {},
  setAttribute(name, value) { this.attributes[name] = value; },
}));
const context = vm.createContext({URL, document: {
  getElementById: element,
  querySelectorAll: selector => selector === '[data-trial-chart]' ? chartButtons : [],
}});
const source = fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
vm.runInContext(source.replace(/init\(\);\s*$/, ''), context);
const run = code => vm.runInContext(code, context);
const read = code => JSON.parse(run(`JSON.stringify(${code})`));

const program = (id, categories) => ({
  id, name: `Program ${id}`, sponsor: 'Sponsor & partner', indication: 'Indication',
  ai_categories: categories, trial_scope: 'explicit', ai_role: 'Verified AI role.',
  evidence_type: 'Primary evidence', evidence_url: `https://example.org/program/${id}`,
});
const trial = (id, program_id, extras = {}) => ({
  id, program_id, start_date: '2026-01-10', start_type: 'ACTUAL',
  phases: ['PHASE2'], status: 'COMPLETED', status_updated: '2026-08-20',
  url: `https://clinicaltrials.gov/study/${id}`, ...extras,
});
const outcome = (id, trial_id, program_id, date, result, endpoint_type = 'efficacy') => ({
  id, trial_id, program_id, date, outcome: result, endpoint_type,
  label: `Readout ${id}`, summary: `Evidence for ${id}.`, endpoint: 'Prespecified endpoint',
  attribution_note: 'This result does not establish AI causation.',
  evidence_level: 'Peer-reviewed trial', date_basis: 'Publication date',
  sources: [{title: `Source ${id}`, url: `https://example.org/result/${id}`}],
});
const fixture = {
  available: true, fetched_at: '2026-09-12T00:00:00Z', outcomes_reviewed_at: '2026-09-12',
  programs: [
    program('design', ['molecular_design', 'target_selection']),
    program('analysis', ['trial_analysis']),
    program('reuse', ['repurposing']),
  ],
  trials: [
    trial('A', 'design'), trial('A', 'design'), // One ID with overlapping categories counts once.
    trial('B', 'design'),
    trial('C', 'analysis', {start_date: '2023-01-10', coverage_date: '2026-07-10'}),
    trial('D', 'reuse', {start_date: '2020-03-01', comparison_start_date: '2026-04-05', coverage_date: '2026-04-05', scope_note: 'Relevant drug comparison only.', status: 'RECRUITING'}),
    trial('E', 'analysis', {coverage_date: '2026-06-10'}),
    trial('F', 'design'),
    trial('G', 'reuse', {status: 'TERMINATED', why_stopped: 'Development stopped.'}),
    trial('estimated', 'reuse', {start_type: 'ESTIMATED'}),
    trial('future', 'design', {start_date: '2026-10-01'}),
    trial('missing-date', 'design', {start_date: null}),
  ],
  outcomes: [
    outcome('a-positive', 'A', 'design', '2026-06-01', 'primary_efficacy_met'),
    outcome('a-negative', 'A', 'design', '2026-08-01', 'not_met'),
    outcome('a-safety', 'A', 'design', '2026-07-01', 'primary_safety_met', 'safety'),
    outcome('b-safety', 'B', 'design', '2026-06-02', 'primary_safety_met', 'safety'),
    outcome('c-positive', 'C', 'analysis', '2024-01-15', 'primary_efficacy_met'),
    outcome('d-positive', 'D', 'reuse', '2026-05-01', 'primary_efficacy_met'),
    outcome('d-confirmed', 'D', 'reuse', '2026-06-01', 'primary_efficacy_met'),
    outcome('e-mixed', 'E', 'analysis', '2026-06-10', 'mixed'),
    outcome('f-negative', 'F', 'design', '2026-06-11', 'not_met'),
    outcome('g-stopped', 'G', 'reuse', '2026-06-12', 'discontinued'),
    outcome('wrong-program', 'A', 'reuse', '2026-05-01', 'primary_efficacy_met'),
    outcome('unknown-trial', 'unknown', 'design', '2026-05-01', 'primary_efficacy_met'),
    outcome('estimated-result', 'estimated', 'reuse', '2026-05-01', 'primary_efficacy_met'),
    outcome('future-result', 'B', 'design', '2026-10-01', 'primary_efficacy_met'),
  ],
};
context.fixture = fixture;
run(`state.data={jobs:{},health:[],math_news:{records:[]},trials:fixture}; state.month='2026-09'; state.trialCategory='all';`);

assert.deepEqual(read('countedTrials().map(t=>t.id)'), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
assert.equal(run('countedTrials().length'), 7, 'All deduplicates IDs and excludes estimated, future and missing starts');
run(`state.trialCategory='target_selection';`);
assert.deepEqual(read('countedTrials().map(t=>t.id)'), ['A', 'B', 'F'], 'A multi-role program appears in each relevant filter');
assert.equal(run('countedTrials(false).length'), 7, 'Overview ignores the selected trial category');
run('drawOverview();');
assert.equal(element('overview-trials').textContent, '3');
assert.equal(element('overview-trials-detail').textContent, '7 trials · all AI-use categories');

run(`state.trialCategory='all'; state.month='2026-05';`);
assert.ok(!read('countedTrials().map(t=>t.id)').includes('C'), 'A retrospective AI analysis does not backdate coverage to the trial start');
assert.ok(!read('countedTrials().map(t=>t.id)').includes('E'), 'Future AI coverage dates remain excluded');
run(`state.month='2026-03';`);
assert.ok(!read('countedTrials().map(t=>t.id)').includes('D'), 'A platform trial enters on its relevant comparison date');
run(`state.month='2026-04';`);
assert.ok(read('countedTrials().map(t=>t.id)').includes('D'));
run(`state.month='2026-06';`);
assert.equal(run(`successfulTrialOutcomes(countedTrialOutcomes(),'efficacy').length`), 2, 'Before the later negative report A and D have positive primary results');
run(`state.month='2026-07';`);
assert.ok(read('countedTrials().map(t=>t.id)').includes('C'), 'AI analysis is included in its report month');
assert.equal(run(`successfulTrialOutcomes(countedTrialOutcomes(),'efficacy').length`), 3);
run(`state.month='2026-09';`);
const outcomeIds = read('countedTrialOutcomes().map(o=>o.id)');
for (const excluded of ['wrong-program', 'unknown-trial', 'estimated-result', 'future-result']) {
  assert.ok(!outcomeIds.includes(excluded), `${excluded} must not enter the reviewed result population`);
}
assert.deepEqual(read(`successfulTrialOutcomes(countedTrialOutcomes(),'efficacy').map(o=>o.trial_id).sort()`), ['C', 'D'], 'Mixed, missed, discontinued and superseded positives are not successes');
assert.deepEqual(read(`successfulTrialOutcomes(countedTrialOutcomes(),'safety').map(o=>o.trial_id).sort()`), ['A', 'B'], 'Safety stays separate; an efficacy failure does not erase a safety result');
assert.equal(run(`countedTrialOutcomes().find(o=>o.id==='c-positive').count_date`), '2026-07-10');
const series = read('trialSuccessSeries(countedTrialOutcomes())');
assert.deepEqual(series[0].points.find(p => p[0] === '2026-07-01'), ['2026-07-01', 3]);
assert.deepEqual(series[0].points.find(p => p[0] === '2026-08-01'), ['2026-08-01', 2], 'A later negative can lower the number of trials with positive latest primary results');
const laterAI = read(`trialSuccessSeries(countedTrialOutcomes().filter(o=>o.trial_id==='C'))`);
assert.deepEqual(laterAI[0].points[0], ['2026-06-01', 0]);
assert.deepEqual(laterAI[0].points[1], ['2026-07-01', 1], 'Success series begins at the later AI disclosure, not the earlier clinical success');
assert.equal(run('trialSuccessSeries([]).length'), 0);

run(`state.trialCategory='recruitment'; state.trialChart='starts'; drawTrials();`);
assert.equal(element('trial-count').textContent, '0');
assert.match(element('trial-programs').innerHTML, /No verified programs in this category yet/);
assert.match(element('trial-category-note').textContent, /does not mean AI recruitment is absent/);
assert.match(element('trials-chart').innerHTML, /No qualifying entries/);
run(`state.trialChart='outcomes'; drawTrials();`);
assert.match(element('trial-outcomes').innerHTML, /Unreviewed results are not classified as failures/);
assert.equal(element('trial-program-view').hidden, true);
assert.equal(element('trial-outcome-view').hidden, false);
assert.equal(chartButtons[1].attributes['aria-pressed'], 'true');

run(`state.trialCategory='all'; state.trialChart='starts'; drawTrials();`);
assert.equal(element('trial-count').textContent, '7');
assert.equal(element('trial-efficacy-count').textContent, '2');
assert.equal(element('trial-safety-count').textContent, '2');
assert.equal(element('trial-program-view').hidden, false);
assert.equal(element('trial-outcome-view').hidden, true);
assert.match(element('trial-programs').innerHTML, /Molecular design/);
assert.match(element('trial-programs').innerHTML, /Target selection/);
assert.match(element('trial-programs').innerHTML, /Sponsor &amp; partner/);
assert.match(element('trial-programs').innerHTML, /href="https:\/\/clinicaltrials.gov\/study\/D" target="_blank" rel="noopener noreferrer"/);
assert.match(element('trial-programs').innerHTML, /Platform: Mar 1, 2020/);
assert.match(element('trial-programs').innerHTML, /Included: Apr 5, 2026/);
assert.match(element('trial-programs').innerHTML, /Platform: Recruiting/);
assert.match(element('trial-programs').innerHTML, /Updated Aug 20, 2026/);
assert.match(element('trial-programs').innerHTML, /Jan 10, 2026 \(estimated\)/);
assert.match(element('trial-programs').innerHTML, /Not counted by selected month/);
assert.match(element('trial-programs').innerHTML, /Development stopped/);
run(`state.trialChart='outcomes'; drawTrials();`);
for (const label of ['Efficacy endpoint met', 'Positive safety readout', 'Mixed results', 'Primary endpoint not met', 'Discontinued']) {
  assert.ok(element('trial-outcomes').innerHTML.includes(label), `Render result classification: ${label}`);
}
assert.match(element('trial-outcomes').innerHTML, /AI involvement was reported Jul 10, 2026, after this result/);
assert.match(element('trial-outcomes').innerHTML, /href="https:\/\/example.org\/result\/c-positive"/);
assert.match(element('trial-outcome-coverage').textContent, /7 of 7 included trials/);
assert.doesNotMatch(element('trials-chart').innerHTML, /NaN|Infinity/);

run(`state.data.trials={available:false,programs:[],trials:[],outcomes:[]}; drawTrials();`);
assert.equal(element('trial-count').textContent, '—');
assert.equal(element('trial-efficacy-count').textContent, '—');
assert.match(element('trial-outcomes').innerHTML, /No registry snapshot available/);

// Exercise the exported snapshot across every category and both chart modes.
context.snapshot = JSON.parse(fs.readFileSync(new URL('../dist/data/dashboard.json', import.meta.url), 'utf8'));
run(`state.data=snapshot; state.month='2026-09';`);
assert.ok(run('state.data.trials.outcomes.length>0'), 'The shipped snapshot contains the reviewed outcomes');
for (const category of ['all', 'molecular_design', 'target_selection', 'repurposing', 'recruitment', 'trial_analysis']) {
  for (const chart of ['starts', 'outcomes']) {
    run(`state.trialCategory=${JSON.stringify(category)}; state.trialChart=${JSON.stringify(chart)}; drawTrials();`);
    assert.doesNotMatch(element('trials-chart').innerHTML, /NaN|Infinity/, `${category}/${chart} has finite chart coordinates`);
  }
}
console.log('Trial category, timing, outcome classification, rendering and exported snapshot checks passed.');
