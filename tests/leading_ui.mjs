import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const elements=new Map();const buttons=['all','capability','adoption','jobs','investment','outcomes','science','sentiment'].map(group=>({dataset:{leadingGroup:group},attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(type,fn){this.handler=fn;}}));
const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,addEventListener(type,fn){this.handler=fn;}});return elements.get(id);};
const context=vm.createContext({URL,document:{getElementById:element,querySelectorAll:()=>buttons}});
vm.runInContext(fs.readFileSync('dist/leading.js','utf8'),context);
vm.runInContext(fs.readFileSync('dist/app.js','utf8').replace(/init\(\);\s*$/,''),context);
const run=code=>vm.runInContext(code,context);
run(`state.month='2026-08';state.data={leading_indicators:{sources:[],gaps:[{group:'science',name:'Validation',note:'Coverage missing'}],series:{
 a:{id:'a',name:'A <unsafe>',group:'jobs',unit:'index',frequency:'monthly',note:'Definition',url:'https://example.org',source_name:'Primary',kind:'Broad proxy',chart_id:'same',points:[['2026-05-31',-2],['2026-06-30',null],['2026-07-31',0],['2026-09-01',999]]},
 b:{id:'b',name:'Different units',group:'jobs',unit:'count',chart_id:'same',frequency:'monthly',note:'Definition',url:'https://example.org',points:[['2026-07-31',10]]}
}}};drawLeading();`);
assert.equal(run(`leadingCards(state.data.leading_indicators).length`),2,'Incompatible units split into separate cards');
assert.doesNotMatch(element('leading-content').innerHTML,/NaN|Infinity|999|<unsafe>/);
assert.match(element('leading-content').innerHTML,/A &lt;unsafe&gt;/);
assert.match(element('leading-content').innerHTML,/Not yet measured/);
assert.equal(run(`leadingVisible(state.data.leading_indicators.series.a).length`),3,'Nulls preserved; future month excluded');
const chart=run(`leadingChart(leadingCards(state.data.leading_indicators)[0])`);
assert.equal((chart.match(/M[0-9]/g)||[]).length,2,'A null breaks the path');
assert.equal((chart.match(/<circle/g)||[]).length,2,'A missing estimate never becomes a zero dot');
assert.match(chart,/>-2/);
run('bindLeadingControls();');buttons.find(b=>b.dataset.leadingGroup==='science').handler();
assert.equal(element('leading-count').textContent,'0 charts · through August 2026');
assert.doesNotMatch(element('leading-content').innerHTML,/A &lt;unsafe&gt;/);
assert.match(element('leading-content').innerHTML,/Science &amp; medicine/);
assert.equal(buttons.filter(b=>b.attrs['aria-pressed']==='true').length,1);
run(`leadingState.group='all';state.data.leading_indicators.sources=[{source:'leading-metr',status:'failed'}];drawLeading();`);
assert.equal(element('leading-status').hidden,false);
assert.match(element('leading-status').textContent,/last successful snapshot/);
run(`state.month='2020-01';drawLeading();`);
assert.match(element('leading-content').innerHTML,/No observations in this date range/);
assert.doesNotMatch(element('leading-content').innerHTML,/2026|Infinity|NaN/);
run(`state.month='2026-08';leadingState.range='1';state.data.leading_indicators.series.a.points=[['2024-01-01',1234],['2026-07-31',1]];drawLeading();`);
assert.doesNotMatch(element('leading-content').innerHTML,/1,234/);
const html=fs.readFileSync('dist/index.html','utf8');assert.match(html,/aria-controls="panel-leading"/);assert.match(html,/leading\.js\?v=/);
console.log('Leading charts: date/category filters, units, null gaps, negative/single values, source failures and escaping passed.');
