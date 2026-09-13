import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const elements=new Map();
const make=(dataset={})=>({dataset,attrs:{},handlers:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,v){this.handlers[k]=v;},focus(){this.focused=true;},scrollIntoView(){}});
const element=id=>{if(!elements.has(id))elements.set(id,{...make(),innerHTML:'',textContent:'',hidden:false});return elements.get(id);};
const groups=['all','capability','adoption','jobs','investment','outcomes','science'].map(leadingGroup=>make({leadingGroup}));
const layouts=['trendlines','heatmap'].map(leadingOverview=>make({leadingOverview}));
const context=vm.createContext({URL,document:{getElementById:element,querySelectorAll:s=>s==='[data-leading-group]'?groups:s==='[data-leading-overview]'?layouts:[],querySelector:()=>make()}});
for(const file of ['leading.js','leading-overview.js','app.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8').replace(/init\(\);\s*$/,''),context);
const run=code=>vm.runInContext(code,context);
run(`state.month='2026-09';state.data={leading_indicators:{sources:[],gaps:[],series:{
 a:{id:'a',name:'Negative & null',group:'jobs',unit:'index',frequency:'monthly',source_name:'Source',url:'https://example.org',note:'Definition',points:[['2023-01-01',999],['2026-01-31',-10],['2026-02-28',null],['2026-03-31',0],['2026-10-01',777]]},
 b:{id:'b',name:'Single',group:'jobs',unit:'percent',frequency:'quarterly',points:[['2026-06-30',0]]},
 c:{id:'c',name:'Constant',group:'capability',unit:'count',frequency:'monthly',points:[['2026-01-31',5],['2026-02-28',5]]},
 d:{id:'d',name:'<unsafe>',group:'investment',unit:'MW',frequency:'event',display:'scatter',points:[['2025-01-01',3],['2026-03-01',8]]}
}}};drawLeading();bindLeadingControls();`);
assert.match(element('leading-count').textContent,/4 variables/);
assert.match(element('leading-content').innerHTML,/leading-trend-overview/);
assert.equal((element('leading-content').innerHTML.match(/class="leading-mini-row"/g)||[]).length,4);
assert.doesNotMatch(element('leading-content').innerHTML,/class="leading-card"|Data &amp; sources|NaN|Infinity|<unsafe>|>999<|>777</);
assert.match(element('leading-content').innerHTML,/&lt;unsafe&gt;/);
assert.equal(element('leading-range').value,'3','Compact overview starts at 3 years');
assert.equal(element('leading-overview-controls').hidden,false);
assert.equal(layouts.filter(b=>b.attrs['aria-pressed']==='true').length,1);
run('globalThis.model=leadingOverviewModel(leadingCards(state.data.leading_indicators));');
assert.equal(run('model.series[0].points.length'),3,'Old and future observations excluded');
assert.equal(run('model.start'),'2023-09-01');assert.equal(run('model.end'),'2026-09-30');assert.equal(run('model.binMonths'),3);
assert.equal(run('model.bins[0].partial'),true,'Clipped boundary quarter is labeled');
const spark=run('leadingMiniChart(model.series[0],model)');
assert.equal((spark.match(/M[0-9]/g)||[]).length,2,'Missing observations break sparkline paths');
assert.equal((spark.match(/<circle/g)||[]).length,2,'A zero is real; a null is not');
assert.doesNotMatch(run('leadingMiniChart(model.series.find(s=>s.id==="d"),model)'),/<path/,'Irregular scatter data are not connected');
const latestX=Number([...spark.matchAll(/cx="([^"]+)"/g)].at(-1)[1]);assert.ok(latestX<132,'Stale series stops before right edge of shared time axis');
layouts[1].handlers.click();
assert.match(element('leading-content').innerHTML,/leading-heat-overview/);
assert.doesNotMatch(element('leading-content').innerHTML,/class="leading-mini-row"|class="leading-card"/);
assert.match(element('leading-overview-note').innerHTML,/Quarterly cells/);
assert.equal(element('leading-heat-inspection').hidden,false);
run(`globalThis.item=model.series[0];globalThis.bin={start:'2026-01-01',end:'2026-03-31'};`);
assert.equal(run('leadingHeatValue(item,bin).point[1]'),0,'Bin uses last actual observation, not a sum/average');
assert.equal(run('leadingHeatValue(item,bin).position'),1,'Normalize including real negative values');
assert.equal(run(`leadingHeatValue(item,{start:'2026-02-01',end:'2026-02-28'}).state`),'missing','Explicit null remains missing');
assert.equal(run(`leadingHeatValue(item,{start:'2026-07-01',end:'2026-09-30'}).state`),'missing','Never carry data into empty periods');
assert.equal(run(`leadingHeatValue(model.series.find(s=>s.id==='b'),{start:'2026-04-01',end:'2026-06-30'}).state`),'single');
assert.equal(run(`leadingHeatValue(model.series.find(s=>s.id==='c'),bin).state`),'constant');
assert.doesNotMatch(element('leading-content').innerHTML,/NaN|Infinity|undefined/);
run(`leadingState.overviewRange='1';drawLeading();`);assert.match(element('leading-overview-note').innerHTML,/Monthly cells/);
run(`leadingState.overviewRange='all';state.data.leading_indicators.series.a.points.unshift(['2015-01-31',10]);drawLeading();`);assert.match(element('leading-overview-note').innerHTML,/Annual cells/);
run(`leadingOpenDetail('jobs','a');`);
assert.match(element('leading-content').innerHTML,/class="leading-card"/);assert.doesNotMatch(element('leading-content').innerHTML,/leading-heat-table|leading-mini-row/);
assert.equal(element('leading-overview-controls').hidden,true);
assert.equal(element('leading-range').value,'all','Category history remains independent');
assert.equal(element('leading-detail-a').focused,true,'A compact metric opens and focuses its detailed chart');
run(`leadingState.group='all';drawLeading();`);assert.equal(run('leadingState.overview'),'heatmap','Layout choice survives visits to categories');
run(`state.month='2000-01';drawLeading();`);assert.doesNotMatch(element('leading-content').innerHTML,/NaN|Infinity|>777<|>999</);
assert.match(element('leading-content').innerHTML,/No observation/);
// Exercise delegated heatmap inspection and keyboard navigation without hundreds of tab stops.
const table={querySelectorAll:()=>[cell,next],querySelector:()=>next};
const next={tabIndex:-1,focus(){this.focused=true;}};
const cell={dataset:{leadingHeat:'0:0',inspect:'Raw value and period'},closest:s=>s==='table'?table:cell,tabIndex:0};
element('leading-content').handlers.keydown({target:cell,key:'ArrowRight',preventDefault(){}});
assert.equal(next.focused,true);assert.equal(next.tabIndex,0);assert.equal(cell.tabIndex,-1);
element('leading-content').handlers.focusin({target:cell});assert.equal(element('leading-heat-inspection').textContent,'Raw value and period');
console.log('Compact All views: layout switching, normalization, missing/constant/single values, time bins, shared axis, drill-down and keyboard inspection passed.');
