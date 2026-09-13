import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise chart calculations and unavailable states without a browser dependency.
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', clientWidth: 390, querySelectorAll:()=>[],querySelector:()=>null,setAttribute(){},focus(){} });
  return elements.get(id);
};
const context = vm.createContext({ document: { getElementById: element } });
const source = fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
vm.runInContext(source.replace(/init\(\);\s*$/, ''), context);
const run = code => vm.runInContext(code, context);
run(`state.data = {jobs:{}, health:[]}; state.month = '2026-08'; drawJobs(); drawHealth();`);
assert.equal(element('job-value').textContent, '—');
assert.equal(element('health-count').textContent, '—');
assert.match(element('health-chart').innerHTML, /No source observations/);

run(`state.data.jobs.US = {name:'United States',points:[['2026-06-30',3],['2026-08-31',4]]};`);
assert.equal(run(`countryMetric('US').change`), null, 'A missing July cannot become zero');
run(`state.data.jobs.US.points.splice(1,0,['2026-07-31',3.5]);`);
assert.equal(run(`countryMetric('US').change`), .5, 'Changes are percentage points');
run(`state.month='2026-09';`);
assert.equal(run(`countryMetric('US').change`), null, 'No September observation means no change');

run(`state.month='2025-12'; state.data.health=[{date:'2025-12-01',specialty:null,value:10},{date:'2025-12-01',specialty:'Radiology',value:10}]; drawHealth();`);
assert.equal(element('health-chart-period').textContent, '2025–2025');
assert.doesNotMatch(element('health-caption').textContent, /partial/);
assert.doesNotMatch(element('health-chart').innerHTML, /Latest year is partial/);
assert.match(element('specialty-chart').innerHTML, /100.0%/);
run(`state.month='2024-12'; drawHealth();`);
assert.equal(element('health-count').textContent, '—');
assert.equal(element('specialty-chart').innerHTML, '', 'An empty edition clears later specialty shares');
console.log('Dashboard calculations and missing-data checks passed.');

run(`state.month='2026-08'; state.data.trials={available:true,programs:[],trials:[
 {id:'a',program_id:'p1',start_date:'2026-07-01',start_type:'ACTUAL',status:'TERMINATED'},
 {id:'b',program_id:'p1',start_date:'2026-08-05',start_type:'ACTUAL'},
 {id:'c',program_id:'p2',start_date:'2026-08-01',start_type:'ESTIMATED'},
 {id:'d',program_id:'p2',start_date:'2026-10-01',start_type:'ACTUAL'}
]};`);
assert.equal(run('countedTrials().length'), 2, 'Estimated and future starts do not count; terminated trials remain historical starts');
assert.equal(run('new Set(countedTrials().map(t=>t.program_id)).size'), 1, 'Programs are counted separately from studies');
run(`state.data.math_news={records:[
 {id:'a',date:'2026-08-10',category:'advance'},
 {id:'b',date:'2026-09-08',category:'resolution'},
 {id:'c',date:'2026-05-20',category:'resolution'}
]};`);
assert.equal(run('countedMathResults().length'), 2);
run(`state.mathFilter='resolution';`);
assert.equal(run('countedMathResults().length'), 1, 'Partial progress must not enter the resolution filter');
assert.equal(run('countedMathResults(false).length'), 2, 'Overview ignores section filters');
run(`state.month='2026-09'; state.mathFilter='all';`);
assert.equal(run('countedMathResults().length'), 3, 'Report dates limit historical counts');

const tabs = ['overview','leading','sentiment','jobs','supply-chain','devices','trials','theorems','sources'].map(name => ({
  dataset:{tab:name}, attrs:{}, setAttribute(name,value){this.attrs[name]=value;}, tabIndex:0
}));
const panels = tabs.map(tab => ({id:'panel-'+tab.dataset.tab,hidden:false}));
context.document.querySelectorAll = selector => selector === '[role="tab"]' ? tabs : panels;
context.location = {hash:'#overview'};
context.window = {scrollTo(){}};
context.history = {pushState(_state,_unused,hash){context.location.hash=hash;}};
run('drawActivePanel = () => {}; switchTab("trials");');
assert.deepEqual(panels.filter(panel=>!panel.hidden).map(panel=>panel.id), ['panel-trials']);
assert.equal(tabs.filter(tab=>tab.attrs['aria-selected']==='true').length,1);
assert.equal(tabs.filter(tab=>tab.tabIndex===0).length,1);
assert.equal(context.location.hash,'#trials');
run('switchTab("leading");');
assert.deepEqual(panels.filter(panel=>!panel.hidden).map(panel=>panel.id), ['panel-leading']);
run('switchTab("sentiment");');
assert.deepEqual(panels.filter(panel=>!panel.hidden).map(panel=>panel.id), ['panel-sentiment']);
run('switchTab("unknown",false);');
assert.deepEqual(panels.filter(panel=>!panel.hidden).map(panel=>panel.id), ['panel-overview']);

// Check authored element contracts without a browser dependency.
const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url),'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(ids).size,ids.length,'HTML IDs are unique');
for(const id of [...source.matchAll(/\$\("([^"]+)"\)/g)].map(match=>match[1])) {
  if(id === 'tab-') continue;
  assert.ok(ids.includes(id), `Missing element #${id}`);
}
for(const name of tabs.map(tab=>tab.dataset.tab)) {
  assert.ok(html.includes(`aria-controls="panel-${name}"`));
  assert.ok(html.includes(`aria-labelledby="tab-${name}"`));
}
assert.doesNotMatch(html,/The AI Ledger|INDEPENDENT SIGNALS|MONTHLY OBSERVATORY|job description|RESEARCH WATCH/);
assert.ok(html.includes('>Math breakthroughs</button>'));
console.log('Trial/news counts, date filters, tab exclusivity and HTML contracts passed.');

run(`state.data.generated_at='2026-09-12T00:00:00Z';state.month='2026-09';
  globalThis.overlayFixture = {
    ai:{name:'AI',frequency:'daily',points:[['2026-06-30',2],['2026-07-31',4],['2026-08-31',6],['2026-09-04',9]]},
    jobs:{name:'Jobs',frequency:'monthly',points:[['2026-07-31',100],['2026-08-31',110]]}
  };`);
assert.equal(run(`monthlyPoints(overlayFixture.ai).length`),3,'Exclude the incomplete current month from daily-series overlays');
assert.equal(run(`indexedSeries(overlayFixture,['ai','jobs'],'all').baseline`),'2026-07-01','Rebase all series to one common month');
assert.equal(run(`indexedSeries(overlayFixture,['ai','jobs'],'all').series[0].points.at(-1)[1]`),150);
assert.equal(run(`indexedSeries(overlayFixture,['ai','jobs'],'all').series[1].points.at(-1)[1]`),110.00000000000001);
run(`overlayFixture.jobs.points=[['2026-08-31',0]];`);
assert.equal(run(`indexedSeries(overlayFixture,['ai','jobs'],'all').baseline`),null,'Never divide by a zero baseline');
run(`drawSeriesChart('jobs-chart',[{name:'Missing month',points:[['2026-06-01',100],['2026-08-01',120]]}]);`);
assert.match(element('jobs-chart').innerHTML,/d="M[^"]* M/,'Missing reference periods break the line');
run(`state.month='2024-12';state.data.supply_chain={production:{points:[['2025-12-31',3.49]]}};`);
assert.equal(run(`visiblePoints(state.data.supply_chain.production).length`),0,'Annual supply data cannot leak into earlier selections');
console.log('Macro baselines, incomplete months, zero denominators and chart gaps passed.');

run(`state.data.generated_at='2026-09-12T00:00:00Z';state.month='2026-09';
  globalThis.normalizationFixture={
    ai:{name:'AI share',unit:'percent',frequency:'daily',points:[['2025-07-31',80],['2025-09-30',0],['2025-11-30',10],['2026-06-30',20],['2026-08-31',30],['2026-09-04',900]]},
    jobs:{name:'Jobs',unit:'thousand_jobs',frequency:'monthly',points:[['2025-08-31',900],['2025-09-30',100],['2025-10-31',200],['2025-11-30',150],['2026-06-30',250],['2026-08-31',300],['2026-09-30',1000]]},
    constant:{name:'Constant indicator',unit:'percent',frequency:'monthly',points:[['2025-09-30',5],['2025-11-30',5],['2026-06-30',5],['2026-08-31',5]]}
  };
  globalThis.normalizationInput=JSON.stringify(normalizationFixture);
  globalThis.normalized=normalizedJobSeries(normalizationFixture,['ai','jobs','constant'],'all');`);
assert.equal(run('normalized.baseline'),'2025-09-01','Normalization begins at the first month shared by all selected series, including a zero value');
assert.equal(run('normalized.end'),'2026-08-01','The shared window ends at the earliest last observation, excluding incomplete daily months');
assert.deepEqual(JSON.parse(run('JSON.stringify(normalized.series[0].points.map(([day,value])=>[day,Number(value.toFixed(6))]))')),[
  ['2025-09-01',0],['2025-11-01',33.333333],['2026-06-01',66.666667],['2026-08-01',100]
],'Each varying series spans 0–100 using only its observations inside the shared window');
assert.deepEqual(JSON.parse(run('JSON.stringify(normalized.series[1].points)')),[
  ['2025-09-01',0],['2025-10-01',50],['2025-11-01',25],['2026-06-01',75],['2026-08-01',100]
],'A later observation in another series must not distort its normalization range');
assert.ok(run('normalized.series[2].points.every(p=>p[1]===50)'),'A constant series remains finite at the 50 midpoint');
assert.deepEqual(JSON.parse(run('JSON.stringify(normalized.series[0].rawPoints)')),[
  ['2025-09-01',0],['2025-11-01',10],['2026-06-01',20],['2026-08-01',30]
],'Keep original monthly values, including zero, for chart tooltips');
assert.equal(run('JSON.stringify(normalizationFixture)'),run('normalizationInput'),'Scaling does not mutate the source observations');
assert.equal(run(`normalized.series[0].points.some(p=>p[0]==='2025-10-01')`),false,'Do not fill a missing month from a different selected series');
run(`drawSeriesChart('jobs-chart',normalized.series,{unit:'normalized',domain:[0,100]});`);
assert.match(element('jobs-chart').innerHTML,/d="M[^"]* M/,'Normalized chart lines retain missing-month breaks');
assert.match(element('jobs-chart').innerHTML,/Original: 0\.00%/,'Normalized chart tooltips retain the original zero-valued measurement');

run(`globalThis.rangeNormalizationFixture={
  ai:{name:'AI share',frequency:'monthly',points:[['2024-08-31',1000],['2025-07-31',500],['2025-08-31',10],['2026-02-28',15],['2026-08-31',20]]},
  jobs:{name:'Jobs',frequency:'monthly',points:[['2024-08-31',9000],['2025-07-31',8000],['2025-08-31',100],['2026-02-28',150],['2026-08-31',200],['2026-09-30',10000]]}
};globalThis.normalizedYear=normalizedJobSeries(rangeNormalizationFixture,['ai','jobs'],'1');`);
assert.equal(run('normalizedYear.baseline'),'2025-08-01','The 1Y selection is anchored to the shared end month');
assert.equal(run('normalizedYear.end'),'2026-08-01');
for (const index of [0,1]) {
  assert.deepEqual(JSON.parse(run(`JSON.stringify(normalizedYear.series[${index}].points)`)),[
    ['2025-08-01',0],['2026-02-01',50],['2026-08-01',100]
  ],'Historical outliers outside 1Y do not compress the selected plot');
}
assert.deepEqual(JSON.parse(run('JSON.stringify(normalizedYear.series[1].rawPoints)')),[
  ['2025-08-01',100],['2026-02-01',150],['2026-08-01',200]
]);
assert.equal(run(`normalizedJobSeries({empty:{frequency:'monthly',points:[]}},['empty'],'1').series.length`),0,'An empty selected series returns no normalized observations');
assert.equal(run(`normalizedJobSeries({a:{points:[['2026-07-31',0]]},b:{points:[['2026-08-31',1]]}},['a','b'],'all').baseline`),null,'Disjoint observation months cannot invent a common baseline');
console.log('Jobs normalization windows, zeros, constant series, gaps and original values passed.');

context.document.querySelectorAll = () => [];
run(`state.month='2024-12';state.active='supply-chain';state.data.supply_chain={
  adoption_manufacturing:{name:'Enterprises using AI',stage:'Manufacturing',group:'adoption',unit:'percent',frequency:'annual',geography:'EU27',points:[['2021-12-31',6.93],['2023-12-31',6.79],['2024-12-31',10.57],['2025-12-31',17.27]]},
  adoption_trade:{name:'Enterprises using AI',stage:'Trade',group:'adoption',unit:'percent',frequency:'annual',geography:'EU27',points:[['2021-12-31',6.18],['2023-12-31',6.74],['2024-12-31',12.11],['2025-12-31',18.62]]},
  power:{name:'Data-center electricity',stage:'Electricity',group:'adjacent',unit:'gwh',frequency:'quarterly',geography:'IE',points:[['2024-12-31',1830]]}
};setSupplyView('adoption');`);
assert.equal(run('state.supply'),'adoption_manufacturing','Switching views selects a matching indicator');
assert.equal(element('supply-view-adoption').hidden,false);
assert.equal(element('supply-view-infrastructure').hidden,true);
assert.match(element('adoption-chart').innerHTML,/2022/,'Show the missing year on the timeline');
assert.match(element('adoption-chart').innerHTML,/d="M[^"]* M/,'Do not connect across the absent 2022 observation');
assert.doesNotMatch(element('adoption-chart').innerHTML,/17.27|18.62/,'Later survey results cannot leak into earlier selections');
assert.match(element('chain-adoption').innerHTML,/12.11%/);
run(`setSupplyView('adjacent');`);
assert.equal(run('state.supply'),'adoption_manufacturing');
assert.equal(run('state.supplyView'),'adoption','Removed adjacent view is not reachable');
assert.equal(element('supply-view-adoption').hidden,false);
console.log('Supply subviews and annual adoption comparison passed.');
