import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Code-level UI checks: no browser interaction or screenshot inspection.
const elements=new Map();
const element=id=>{
  if(!elements.has(id)) elements.set(id,{innerHTML:'',textContent:'',clientWidth:480,attrs:{},hidden:false,value:'',classList:{toggle(){}},querySelectorAll:()=>[],querySelector:()=>null,setAttribute(k,v){this.attrs[k]=v;},addEventListener(){},focus(){}});
  return elements.get(id);
};
const context=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[]},URL});
const root=new URL('../',import.meta.url);
vm.runInContext(fs.readFileSync(new URL('dist/euv-machine.js',root),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('dist/activity.js',root),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('dist/app.js',root),'utf8').replace(/init\(\);\s*$/,''),context);
const run=code=>vm.runInContext(code,context);
context.fixture=JSON.parse(fs.readFileSync(new URL('dist/data/dashboard.json',root),'utf8'));
run(`state.data=fixture;state.month='2026-09';state.active='supply-chain';drawSupply();`);
assert.equal(run('state.supplyView'),'overview');
assert.equal(element('supply-view-overview').hidden,false);
assert.equal(element('supply-layout').hidden,true);
assert.equal((element('supply-view-overview').innerHTML.match(/data-overview-id=/g) || []).length,16);
run(`setSupplyView('euv');`);
assert.equal(element('supply-view-euv').hidden,false);
assert.equal(element('supply-view-trade').hidden,true);
assert.match(element('supply-name').textContent,/TRUMPF/);
assert.match(element('supply-chart').innerHTML,/svg/);
assert.doesNotMatch(element('supply-chart').innerHTML,/NaN|Infinity/);

const html=fs.readFileSync(new URL('dist/index.html',root),'utf8');
assert.doesNotMatch(html,/data-supply-view="(?:activity|adjacent)"|id="supply-view-(?:activity|adjacent)"/);
assert.match(element('euv-components').innerHTML,/class="euv-machine"/);
assert.equal((element('euv-components').innerHTML.match(/role="button"/g) || []).length,9);
assert.doesNotMatch(element('euv-components').innerHTML,/class="euv-node"|<button/);
assert.equal(run(`new Set(EUV_PARTS.flatMap(p=>p.nodes)).size`),context.fixture.euv.nodes.length,'All existing supplier/site records are reachable from the diagram');
run(`setSupplyView('activity');setSupplyView('adjacent');`);
assert.equal(run('state.supplyView'),'euv','Removed views cannot be activated');
assert.equal(run(`yearChange([['2023-02-28',100],['2024-02-29',110]],['2024-02-29',110]).toFixed(1)`),'10.0');

run(`setSupplyView('trade');`);
assert.match(element('trade-coverage').textContent,/9\/12/);
assert.match(element('trade-coverage').textContent,/China.*Other Asia.*Viet Nam/);
assert.equal(run(`valueLabel(49243.818,'usd')`),'$49.2k');
assert.equal(run(`valueLabel(12,'usd')`),'$12');
assert.match(element('supply-chart').innerHTML,/>\$[\d.]+bn<\/text>/,'Billion-dollar axis ticks are compact');
run(`explorer.origin='156';explorer.product='847150';drawSupply();`);
assert.equal(element('supply-value').textContent,'—','A missing 2025 reporter must not fall back to a 2024 value');
assert.equal(element('supply-period').textContent,'Unavailable in 2025');
run(`explorer.tradeYear='2024';drawSupply();`);
assert.notEqual(element('supply-value').textContent,'—');
assert.match(element('trade-coverage').textContent,/11\/12/);
run(`state.month='2023-09';drawSupply();`);
assert.equal(run('explorer.tradeYear'),'2022','An annual observation dated December is not available in September');

run(`state.month='2026-09';explorer.origin='all';explorer.tradeYear='2024';explorer.product='280461';drawSupply();`);
assert.match(element('trade-product').innerHTML,/optgroup label="Materials"/);
assert.match(element('trade-coverage').textContent,/10\/12/);
assert.match(element('trade-coverage').textContent,/Mexico/);
assert.match(element('supply-context').innerHTML,/Where it is used/);
assert.match(element('supply-context').innerHTML,/solar/);
assert.match(element('trade-edges').innerHTML,/2024 · exports/);
assert.match(element('trade-edges').innerHTML,/data-trade-edge/);
run(`explorer.product='284920';drawSupply();`);
assert.match(element('trade-coverage').textContent,/11\/12/,'Availability changes with product, not only year');
run(`globeZoomChanged('trade',5);`);
assert.equal(element('trade-zoom-in').disabled,true);
assert.equal(element('trade-zoom-out').disabled,false);
assert.equal(element('trade-zoom-reset').textContent,'5.0×');

run(`state.month='2026-09';setSupplyView('euv');`);
assert.match(element('supply-name').textContent,/TRUMPF/);
assert.equal(element('supply-value').textContent,'€724m');
assert.equal(element('supply-period').textContent,'FY ended Jun 2025');
assert.match(element('supply-context').innerHTML,/Announced plan/);
assert.match(element('supply-context').innerHTML,/Reported completed/);
run(`explorer.node='asml_sandiego';drawSupply();`);
assert.equal(element('supply-value').textContent,'—','No invented source-component shipment count');
assert.match(element('supply-chart').innerHTML,/No reported time series/);
assert.match(element('supply-context').innerHTML,/Source components/);
assert.equal(run(`eventByMonth({date:'2026'})`),false,'A year-only event has no fabricated month');
run(`explorer.node='tsmc_taiwan';drawSupply();`);
assert.match(element('supply-value').textContent,/4.34m wafers/);
run(`selectEuvPart('mask');`);
assert.equal(run('explorer.node'),'hoya_singapore');
assert.match(element('supply-context').innerHTML,/Fab consumable/);
run(`selectEuvPart('vacuum');`);
assert.equal(run('explorer.node'),'vat_haag');
assert.match(element('euv-location').innerHTML,/Penang/);
assert.match(element('supply-context').innerHTML,/does not establish a named ASML supplier link/);
run(`selectEuvPart('optics');`);
assert.match(element('euv-location').innerHTML,/Oberkochen.*Wetzlar/);
assert.match(element('euv-components').innerHTML,/data-euv-part="optics"[^>]*aria-pressed="true"/);
run(`selectEuvPart('stage');`);
assert.equal(run('explorer.node'),'asml_berlin');

for(const [id,s] of Object.entries(context.fixture.supply_chain)) {
  context.series=s;
  run(`drawSeriesChart('test-chart',[{...series,points:visiblePoints(series)}],{frequency:series.frequency,unit:series.unit,label:series.name});`);
  assert.doesNotMatch(element('test-chart').innerHTML,/NaN|Infinity/,id);
}
console.log('Machine component selection, removed tabs, trade coverage and history charts passed.');

// Overview totals use matched routes so missing reporters cannot fake a decline.
const baskets={'8542':98,'847150':98,'848620':80,'280461':44,'284920':37,'281820':54,'690912':60,'690919':73,'281122':69,'800110':30,'8102':49};
run(`state.month='2026-09';setSupplyView('overview');`);
for(const [id,count] of Object.entries(baskets)) {
  context.productId=id;
  assert.equal(run(`tradeOverviewSeries(state.data.trade.commodities.find(c=>c.id===productId)).routes`),count,id);
  assert.equal(run(`tradeOverviewSeries(state.data.trade.commodities.find(c=>c.id===productId)).points.length`),7,id);
}
context.syntheticRoutes=[
  ['steady',{commodity:'test',origin:'A',points:[['2020-12-31',0],['2021-12-31',10],['2022-12-31',20]]}],
  ['missing',{commodity:'test',origin:'B',points:[['2020-12-31',1000],['2021-12-31',1100]]}],
];
assert.equal(run(`JSON.stringify(tradeOverviewSeries({id:'test',name:'Example'},syntheticRoutes).points)`),JSON.stringify([['2020-12-31',0],['2021-12-31',10],['2022-12-31',20]]),'Missing reports are excluded across years; explicit zeros remain');
run(`state.month='2022-09';`);
assert.equal(run(`JSON.stringify(tradeOverviewSeries({id:'test',name:'Example'},syntheticRoutes).points)`),JSON.stringify([['2020-12-31',1000],['2021-12-31',1110]]),'Annual observations after selected month do not enter the basket');
context.disjointRoutes=[['a',{commodity:'test',origin:'A',points:[['2020-12-31',1]]}],['b',{commodity:'test',origin:'B',points:[['2021-12-31',2]]}]];
assert.equal(run(`tradeOverviewSeries({id:'test',name:'Example'},disjointRoutes).points.length`),0,'No common routes means unavailable, not zero');
assert.doesNotMatch(run(`supplyMiniChart({name:'Flat',frequency:'monthly',unit:'index',points:[['2020-01-31',0],['2020-02-29',0]]})`),/NaN|Infinity/);
assert.match(run(`supplyMiniChart({name:'Gaps',frequency:'monthly',unit:'index',points:[['2020-01-31',10],['2020-03-31',20]]})`),/class="supply-mini-line" d="M[^\"]* M/,'Sparklines do not connect missing months');
run(`state.month='2026-09';openSupplyOverviewDetail('infrastructure','memory');`);
assert.equal(run('state.supplyView'),'infrastructure');assert.equal(run('state.supply'),'memory');
assert.equal(element('supply-view-overview').hidden,true);assert.equal(element('supply-layout').hidden,false);
run(`openSupplyOverviewDetail('trade','284920');`);
assert.equal(run('state.supplyView'),'trade');assert.equal(run('explorer.product'),'284920');assert.equal(run('explorer.origin'),'all');
assert.equal(run('explorer.tradeYear'),'2025');
run(`activityGlobes.trade={setActive(active){this.active=active;}};setSupplyView('overview');`);
assert.equal(run('activityGlobes.trade.active'),false,'Overview stops the hidden globe');
assert.doesNotMatch(element('supply-view-overview').innerHTML,/NaN|Infinity|undefined/);
assert.match(element('supply-view-overview').innerHTML,/not global totals/);
assert.equal((element('supply-view-overview').innerHTML.match(/class="supply-mini-line"/g) || []).length,16);
console.log('Supply overview grouping, comparable trade baskets, date limits, gaps and detail navigation passed.');
