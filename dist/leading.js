"use strict";
const leadingGroups={capability:'Capability & cost',adoption:'Adoption & delegation',jobs:'Hiring & employment',investment:'Investment & capacity',outcomes:'Economic outcomes',science:'Science & medicine'};
const leadingColors=['#315b72','#98714f','#52705a'];
const leadingState={group:'all',range:'all',overviewRange:'3',overview:'trendlines'};
const leadingPairs={
  hires_total:['hires','Hiring rates','All industries'],hires_professional:['hires','Hiring rates','Professional & business services'],
  labor_productivity:['productivity','Productivity and real pay','Output per hour'],real_compensation:['productivity','Productivity and real pay','Real hourly compensation'],
  business_applications:['applications','New business applications','All applications'],high_propensity_applications:['applications','New business applications','Likely employers']
};
function leadingVisible(item){
  const end=state.month+'-31';
  const range=typeof leadingOverviewRange==='function'?leadingOverviewRange():leadingState.range;
  const start=range==='all'?'0000':`${Number(state.month.slice(0,4))-Number(range)}${state.month.slice(4)}-01`;
  return (item.points||[]).filter(p=>p[0]>=start && p[0]<=end);
}
function leadingCards(data){
  const cards=new Map();
  Object.values(data.series||{}).forEach(original=>{
    const pair=leadingPairs[original.id];
    const item=pair?{...original,chart_id:pair[0],chart_title:pair[1],legend:pair[2]}:original;
    if(leadingState.group!=='all' && item.group!==leadingState.group)return;
    // A mismatched unit must never silently share an axis.
    const key=(item.chart_id||item.id)+'|'+item.unit+'|'+item.group;
    if(!cards.has(key))cards.set(key,{title:item.chart_title||item.name,group:item.group,series:[]});
    cards.get(key).series.push({...item,points:leadingVisible(item)});
  });
  return [...cards.values()];
}
function leadingNumber(v){
  if(v===null || v===undefined)return '—';
  return new Intl.NumberFormat('en-US',{maximumFractionDigits:Math.abs(v)<1?3:Math.abs(v)<100?2:1}).format(v);
}
function leadingUnit(unit){return {percent:'%',index:'Index',count:'Count',usd_mn:'USD million',usd_bn:'USD billion',usd_bn_saar:'USD billion · annualized rate',gwh:'GWh'}[unit]||unit;}
function leadingDate(date,frequency){
  if(frequency==='annual')return date.slice(0,4);
  if(frequency==='quarterly')return `Q${Math.ceil(Number(date.slice(5,7))/3)} ${date.slice(0,4)}`;
  return formatDate(date,frequency==='monthly'?{month:'short',year:'numeric'}:{month:'short',day:'numeric',year:'numeric'});
}
function leadingTooltip(item,point){
  const detail=(item.point_details||[]).find(d=>d.date===point[0]);
  return `${item.legend||item.name}: ${leadingNumber(point[1])} ${leadingUnit(item.unit)} · ${leadingDate(point[0],item.date_precision==='month'?'monthly':item.frequency)}`+(detail?.model?` · ${detail.model}`:'')+
    (detail?.ci_low!=null && detail?.ci_high!=null?` · Source 95% CI ${leadingNumber(detail.ci_low)}–${leadingNumber(detail.ci_high)}`:'');
}
function leadingChart(card){
  const all=card.series.flatMap(s=>s.points).filter(p=>Number.isFinite(p[1]));
  if(!all.length)return '<div class="leading-empty">No observations in this date range.</div>';
  const w=440,h=170,m={l:49,r:10,t:15,b:26};
  const times=all.map(p=>Date.parse(p[0]+'T00:00:00Z'));let t0=Math.min(...times),t1=Math.max(...times);
  const values=all.map(p=>p[1]);let low=Math.min(...values),high=Math.max(...values);
  const pad=(high-low)*.12||Math.max(Math.abs(high)*.06,1);low-=pad;high+=pad;
  if(Math.min(...values)>=0)low=Math.max(0,low);
  const x=p=>t1===t0?(m.l+w-m.r)/2:m.l+(Date.parse(p[0]+'T00:00:00Z')-t0)/(t1-t0)*(w-m.l-m.r);
  const y=v=>h-m.b-(v-low)/(high-low)*(h-m.t-m.b);
  const compact=v=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(v);
  let markup='';
  for(let i=0;i<3;i++){
    const v=low+(high-low)*i/2;
    markup+=`<line x1="${m.l}" x2="${w-m.r}" y1="${y(v)}" y2="${y(v)}" class="leading-gridline"/><text x="${m.l-7}" y="${y(v)+3}" text-anchor="end">${escapeHTML(compact(v))}</text>`;
  }
  card.series.forEach((s,i)=>{
    let path='';let prev=null;
    const gap={monthly:45,quarterly:110,annual:400,biweekly:22}[s.frequency]||Infinity;
    s.points.forEach(p=>{
      if(!Number.isFinite(p[1])){prev=null;return;}
      const discontinuity=!prev || (Date.parse(p[0])-Date.parse(prev[0]))/86400000>gap;
      path+=discontinuity?`M${x(p)},${y(p[1])}`:s.display==='step'?`H${x(p)}V${y(p[1])}`:`L${x(p)},${y(p[1])}`;prev=p;
    });
    if(s.display!=='scatter')markup+=`<path d="${path}" fill="none" stroke="${leadingColors[i%3]}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    s.points.filter(p=>Number.isFinite(p[1])).forEach(p=>markup+=`<circle cx="${x(p)}" cy="${y(p[1])}" r="${s.points.length>35?2:3}" fill="${leadingColors[i%3]}"><title>${escapeHTML(leadingTooltip(s,p))}</title></circle>`);
  });
  const dates=all.map(p=>p[0]).sort();
  const label=d=>formatDate(d,{month:'short',year:'2-digit'});
  markup+=`<text x="${m.l}" y="${h-4}">${escapeHTML(label(dates[0]))}</text>`;
  if(t1!==t0)markup+=`<text x="${w-m.r}" y="${h-4}" text-anchor="end">${escapeHTML(label(dates.at(-1)))}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(card.title+'; '+leadingUnit(card.series[0].unit_label||card.series[0].unit)+'. Exact values in Data and sources below.')}" class="leading-chart">${markup}</svg>`;
}
function leadingSourceDetails(card){
  return `<details class="leading-details"><summary>Data &amp; sources</summary>${card.series.map(s=>{
    const evidence=Array.isArray(s.point_details)?s.point_details:[];
    return `<div class="leading-definition"><strong>${escapeHTML(s.legend||s.name)}</strong><p>${escapeHTML(s.note)}</p><p>${externalLink(s.url,s.source_name)} · ${escapeHTML(s.mode||'Stored observations')}${s.published_at?' · Source version '+escapeHTML(s.published_at):''}${s.fetched_at?' · Retrieved '+escapeHTML(s.fetched_at.slice(0,10)):''}</p>${s.detail_tab?'<a href="#'+escapeHTML(s.detail_tab)+'">View trial evidence ↗</a>':''}
      <div class="leading-table-wrap"><table><caption class="sr-only">${escapeHTML(s.name)} observations</caption><thead><tr><th scope="col">Period</th><th scope="col">Value</th><th scope="col">Evidence</th></tr></thead><tbody>${[...s.points].reverse().map(p=>{
        const e=evidence.find(e=>e.date===p[0]);
        return `<tr><td>${escapeHTML(leadingDate(p[0],s.date_precision==='month'?'monthly':s.frequency))}</td><td>${escapeHTML(leadingNumber(p[1]))}</td><td>${e?.url?externalLink(e.url,'Report'):e?.model?escapeHTML(e.model)+(e.ci_low!=null && e.ci_high!=null?` · 95% CI ${leadingNumber(e.ci_low)}–${leadingNumber(e.ci_high)}`:''):'—'}</td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  }).join('')}</details>`;
}
function leadingCardHTML(card){
  const alerts=[...new Set(card.series.map(s=>s.alert).filter(Boolean))];
  return `<article class="leading-card" id="leading-detail-${escapeHTML(card.series[0].id)}" tabindex="-1"><div class="leading-card-top"><span>${escapeHTML(card.series[0].kind)}</span><span>${escapeHTML(card.series[0].frequency==='event'?'Dated observations':card.series[0].frequency)}</span></div><h4>${escapeHTML(card.title)}</h4><p class="leading-units">${escapeHTML(leadingUnit(card.series[0].unit_label||card.series[0].unit))} · ${escapeHTML(card.series[0].geography||'')}</p>
    <div class="leading-values">${card.series.map((s,i)=>{
      const p=s.points.at(-1);
      return `<div><span class="leading-key"><i style="background:${leadingColors[i%3]}"></i>${escapeHTML(s.legend||'Latest observation')}</span><strong>${p?escapeHTML(leadingNumber(p[1])):'—'}${s.unit==='percent'?'%':''}</strong><span class="leading-value-date">${p?escapeHTML(leadingDate(p[0],s.date_precision==='month'?'monthly':s.frequency)):'Unavailable in range'}</span></div>`;
    }).join('')}</div>${leadingChart(card)}${alerts.map(a=>`<p class="leading-alert">${escapeHTML(a)}</p>`).join('')}${leadingSourceDetails(card)}</article>`;
}
function drawLeading(){
  const data=state.data.leading_indicators||{series:{},sources:[],gaps:[]};
  const cards=leadingCards(data);
  const overview=leadingState.group==='all' && typeof drawLeadingOverview==='function';
  $('leading-overview-controls').hidden=!overview;
  $('leading-overview-note').hidden=!overview;
  $('leading-heat-inspection').hidden=!overview || leadingState.overview!=='heatmap';
  $('leading-heat-inspection').textContent='Hover or focus a cell for its value and date. Use arrow keys to inspect neighboring cells.';
  $('leading-range').value=overview?leadingState.overviewRange:leadingState.range;
  document.querySelectorAll('[data-leading-overview]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.leadingOverview===leadingState.overview)));
  document.querySelectorAll('[data-leading-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.leadingGroup===leadingState.group)));
  $('leading-count').textContent=`${cards.length} charts · through ${monthName(state.month)}`;
  const problems=(data.sources||[]).filter(s=>s.status!=='success');
  $('leading-status').hidden=!problems.length;
  $('leading-status').textContent=problems.length?'Refresh incomplete: '+problems.map(s=>s.source.replace('leading-','')+' ('+(s.status==='not_run'?'not loaded':'failed')+')').join(', ')+'. Any available charts retain the last successful snapshot.':'';
  if(overview){$('leading-content').innerHTML=drawLeadingOverview(cards,data);return;}
  $('leading-content').innerHTML=Object.entries(leadingGroups).filter(([key])=>leadingState.group==='all'||key===leadingState.group).map(([key,label])=>{
    const groupCards=cards.filter(c=>c.group===key);
    const gaps=(data.gaps||[]).filter(g=>g.group===key);
    return `<section class="leading-section"><h3>${escapeHTML(label)}</h3><div class="leading-chart-grid">${groupCards.map(leadingCardHTML).join('')||'<p class="leading-empty">No stored observations for this category.</p>'}</div>${gaps.length?`<details class="leading-gaps"><summary>Not yet measured · ${gaps.length}</summary>${gaps.map(g=>`<p><strong>${escapeHTML(g.name)}.</strong> ${escapeHTML(g.note)}</p>`).join('')}</details>`:''}</section>`;
  }).join('');
}
function bindLeadingControls(){
  document.querySelectorAll('[data-leading-group]').forEach(b=>b.addEventListener('click',()=>{leadingState.group=b.dataset.leadingGroup;drawLeading();}));
  $('leading-range').addEventListener('change',e=>{if(leadingState.group==='all')leadingState.overviewRange=e.target.value;else leadingState.range=e.target.value;drawLeading();});
  if(typeof bindLeadingOverview==='function')bindLeadingOverview();
}
