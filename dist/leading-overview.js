"use strict";

function leadingOverviewRange(){return leadingState.group==='all'?leadingState.overviewRange:leadingState.range;}
function leadingOverviewModel(cards){
  const series=cards.flatMap(card=>card.series.map(item=>({...item,card_title:card.title,card_id:card.series[0].id})));
  const dates=series.flatMap(s=>s.points.map(p=>p[0])).sort();
  const end=new Date(Date.UTC(Number(state.month.slice(0,4)),Number(state.month.slice(5,7)),0));
  const range=leadingOverviewRange();
  const start=range==='all'?(dates[0]?.slice(0,7)||state.month)+'-01':`${Number(state.month.slice(0,4))-Number(range)}${state.month.slice(4)}-01`;
  const startDate=new Date(start+'T00:00:00Z');
  const months=(end.getUTCFullYear()-startDate.getUTCFullYear())*12+end.getUTCMonth()-startDate.getUTCMonth()+1;
  const binMonths=months>60?12:months>18?3:1;
  const bins=[];
  let year=startDate.getUTCFullYear(),month=Math.floor(startDate.getUTCMonth()/binMonths)*binMonths;
  while(Date.UTC(year,month,1)<=end.getTime()){
    const first=new Date(Date.UTC(year,month,1)),last=new Date(Date.UTC(year,month+binMonths,0));
    const partial=first<startDate || last>end;
    const label=binMonths===12?String(year):binMonths===3?`Q${month/3+1} ’${String(year).slice(2)}`:formatDate(first.toISOString(),{month:'short',year:'2-digit'});
    bins.push({start:first.toISOString().slice(0,10),end:last.toISOString().slice(0,10),label:label+(partial?'*':''),partial});
    month+=binMonths;if(month>=12){year++;month=0;}
  }
  return {series,start,end:end.toISOString().slice(0,10),bins,binMonths};
}
function leadingOverviewStats(item){
  const points=item.points.filter(p=>Number.isFinite(p[1]));
  const values=points.map(p=>p[1]);
  return {count:points.length,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,latest:item.points.at(-1)};
}
function leadingHeatValue(item,bin,stats=leadingOverviewStats(item)){
  const point=item.points.filter(p=>p[0]>=bin.start && p[0]<=bin.end).at(-1);
  if(!point || !Number.isFinite(point[1]))return {point,position:null,state:'missing'};
  if(stats.count===1)return {point,position:null,state:'single'};
  if(stats.min===stats.max)return {point,position:null,state:'constant'};
  return {point,position:(point[1]-stats.min)/(stats.max-stats.min),state:'observed'};
}
function leadingHeatColor(position){
  if(position===null)return '#d8d8d0';
  const light=[233,237,235],dark=[49,91,114];
  return `rgb(${light.map((v,i)=>Math.round(v+(dark[i]-v)*Math.max(0,Math.min(1,position)))).join(',')})`;
}
function leadingOverviewName(item){
  // Retain the facet in the visible label; the complete source title is available on hover.
  if(item.id.startsWith('btos_')){
    const facet=item.scope==='national'?'All businesses':item.facet.replace('Professional, Scientific, and Technical Services','Professional services').replace('Finance and Insurance','Finance & insurance').replace('Educational Services','Education').replace('Employees','employees');
    return facet+' · '+(item.status==='expected'?'planned':'current');
  }
  if(item.id.startsWith('canaries_'))return 'Ages '+item.age_group+' · '+(item.exposure_quintile===5?'high exposure':'low exposure');
  if(item.id.startsWith('metr_'))return 'Task horizon · '+(item.id.includes('p50')?'50%':'80%');
  if(item.id.startsWith('anthropic_'))return (item.id.includes('chat_cowork')?'Chat + Cowork':'API excl. Code')+' · '+(item.id.includes('_directive_')?'delegation':'automation');
  if(item.id.startsWith('leading_us_electronics_'))return 'Electronics · '+item.name.split('product ')[1];
  if(item.chart_id==='power_contracts')return 'Virginia · '+item.legend.toLowerCase();
  return item.name.replace(' · professional & business services',' · professional services').replace(' · all industries',' · all').replace('North American','N.A.').replace('Virginia data-centre connection capacity added','Virginia · capacity added').replace('Lowest inference price at MMLU ≥86%','Inference price · MMLU ≥86%').replace('Trials with primary efficacy endpoints met','Trials · efficacy endpoints met');
}
function leadingOverviewDetail(item){
  const stats=leadingOverviewStats(item),last=stats.latest;
  return item.name+' · '+(last?leadingTooltip(item,last):'No observations in this date range.')+' · '+(item.kind||'')+(item.alert?' · '+item.alert:'');
}
function leadingOverviewValue(item){
  const last=item.points.at(-1);
  return `<span class="leading-mini-value"><strong>${last?escapeHTML(leadingNumber(last[1])):'—'}${last && Number.isFinite(last[1]) && (item.unit==='percent'||item.unit.startsWith('%'))?'%':''}</strong><time>${last?escapeHTML(leadingDate(last[0],item.date_precision==='month'?'monthly':item.frequency)):'No data'}</time></span>`;
}
function leadingOverviewFlag(item){
  const count=leadingOverviewStats(item).count;
  if(!count)return 'No observations in this date range.';
  const parts=[];
  if(item.alert)parts.push(item.alert);
  if(count<3)parts.push(count+' observation'+(count===1?'':'s'));
  return parts.join(' · ');
}
function leadingMiniChart(item,model){
  const w=136,h=34,m=4,stats=leadingOverviewStats(item);
  if(!stats.count)return '<span class="leading-mini-empty">No data</span>';
  const start=Date.parse(model.start+'T00:00:00Z'),end=Date.parse(model.end+'T00:00:00Z');
  const x=p=>m+(Date.parse(p[0]+'T00:00:00Z')-start)/Math.max(1,end-start)*(w-2*m);
  const y=v=>stats.min===stats.max?h/2:h-m-(v-stats.min)/(stats.max-stats.min)*(h-2*m);
  const gap={monthly:45,quarterly:110,annual:400,biweekly:22}[item.frequency]||Infinity;
  let path='',prev=null,dots='';
  item.points.forEach(p=>{
    if(!Number.isFinite(p[1])){prev=null;return;}
    const disconnected=!prev||(Date.parse(p[0])-Date.parse(prev[0]))/86400000>gap;
    path+=disconnected?`M${x(p)},${y(p[1])}`:item.display==='step'?`H${x(p)}V${y(p[1])}`:`L${x(p)},${y(p[1])}`;
    dots+=`<circle cx="${x(p)}" cy="${y(p[1])}" r="${stats.count>30?1:1.7}"/>`;prev=p;
  });
  return `<svg class="leading-mini-chart" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="${m}" x2="${w-m}" y1="${h-m}" y2="${h-m}"/>${item.display!=='scatter'?`<path d="${path}"/>`:''}${dots}</svg>`;
}
function leadingOverviewHeader(group,count){return `<h3><button data-leading-open-group="${escapeHTML(group)}">${escapeHTML(leadingGroups[group])}<span>${count} <span aria-hidden="true">↗</span></span></button></h3>`;}
function leadingTrendOverview(model){
  return `<div class="leading-trend-overview">${Object.keys(leadingGroups).map(group=>{
    const items=model.series.filter(s=>s.group===group);
    return `<section class="leading-overview-section">${leadingOverviewHeader(group,items.length)}<div class="leading-mini-axis"><span>Variable</span><span>${escapeHTML(formatDate(model.start,{month:'short',year:'numeric'}))}<span>${escapeHTML(formatDate(model.end,{month:'short',year:'numeric'}))}</span></span><span>Latest</span></div>${items.map(item=>{
      const flag=leadingOverviewFlag(item);
      return `<button class="leading-mini-row" data-leading-open="${escapeHTML(item.id)}" data-leading-open-group="${escapeHTML(group)}" title="${escapeHTML(leadingOverviewDetail(item))}" aria-label="${escapeHTML(leadingOverviewDetail(item)+'. Open detailed chart.')}"><span class="leading-mini-name">${escapeHTML(leadingOverviewName(item))}<small>${escapeHTML(leadingUnit(item.unit_label||item.unit))}${flag?'<span class="leading-mini-flag" title="'+escapeHTML(flag)+'"> · '+(leadingOverviewStats(item).count<3?leadingOverviewStats(item).count+' point'+(leadingOverviewStats(item).count===1?'':'s'):'ⓘ')+'</span>':''}</small></span>${leadingMiniChart(item,model)}${leadingOverviewValue(item)}</button>`;
    }).join('')||'<p class="leading-mini-empty">No stored variables</p>'}</section>`;
  }).join('')}</div>`;
}
function leadingHeatOverview(model){
  return `<div class="leading-heat-overview">${Object.keys(leadingGroups).map(group=>{
    const items=model.series.filter(s=>s.group===group);
    return `<section class="leading-overview-section">${leadingOverviewHeader(group,items.length)}<div class="leading-heat-scroll"><table class="leading-heat-table"><caption class="sr-only">${escapeHTML(leadingGroups[group])}. Each row uses its own observed minimum and maximum. Use arrow keys between cells; Enter opens the detailed chart.</caption><thead><tr><th scope="col">Variable</th>${model.bins.map(b=>`<th scope="col" class="leading-heat-period"><span>${escapeHTML(b.label)}</span></th>`).join('')}<th scope="col" class="leading-heat-latest">Latest</th></tr></thead><tbody>${items.map((item,row)=>{
      const stats=leadingOverviewStats(item),flag=leadingOverviewFlag(item);
      return `<tr><th scope="row"><button data-leading-open="${escapeHTML(item.id)}" data-leading-open-group="${escapeHTML(group)}" title="${escapeHTML(leadingOverviewDetail(item))}">${escapeHTML(leadingOverviewName(item))}${flag?'<span class="leading-mini-flag" title="'+escapeHTML(flag)+'"> '+(stats.count<3?stats.count+' pts':'ⓘ')+'</span>':''}</button></th>${model.bins.map((bin,col)=>{
        const cell=leadingHeatValue(item,bin,stats);
        const text=item.name+' · '+bin.label+' · '+(cell.state==='missing'?'No observation'+(cell.point?' (missing estimate)':''):leadingTooltip(item,cell.point)+' · '+(cell.state==='single'?'One observation':cell.state==='constant'?'No observed variation':Math.round(cell.position*100)+' / 100 within this variable’s observed range'));
        return `<td class="leading-heat-cell ${cell.state}" data-leading-heat="${row}:${col}" data-leading-open="${escapeHTML(item.id)}" data-leading-open-group="${escapeHTML(group)}" data-inspect="${escapeHTML(text)}" tabindex="${row===0 && col===0?'0':'-1'}" aria-label="${escapeHTML(text)}" title="${escapeHTML(text)}"><span${cell.state!=='missing'?' style="background:'+leadingHeatColor(cell.position)+'"':''}>${cell.state==='single'?'•':cell.state==='constant'?'=':''}</span></td>`;
      }).join('')}<td>${leadingOverviewValue(item)}</td></tr>`;
    }).join('')}</tbody></table></div></section>`;
  }).join('')}</div>`;
}
function drawLeadingOverview(cards,data){
  const model=leadingOverviewModel(cards);
  const heat=leadingState.overview==='heatmap';
  const interval={1:'Monthly',3:'Quarterly',12:'Annual'}[model.binMonths];
  $('leading-overview-note').innerHTML=heat?`<span class="leading-heat-legend">Own low <i></i> Own high <b class="leading-missing-key"></b> No observation</span><span>${interval} cells show the last observation in each period. Color uses each variable’s own range; it does not indicate good or bad. • One point; = constant. * Partial boundary period.</span>`:'Each line uses its own value scale and the same dates. Lines stop at the last observation. Select a variable for its detailed chart.';
  $('leading-count').textContent=`${model.series.length} variables · through ${monthName(state.month)}`;
  const missing=(data.gaps||[]).length;
  return (heat?leadingHeatOverview(model):leadingTrendOverview(model))+(missing?`<p class="leading-overview-gaps">${missing} measures not yet connected. Coverage notes are in each category.</p>`:'');
}
function leadingOpenDetail(group,id){
  leadingState.group=group;drawLeading();
  const card=id?leadingCards(state.data.leading_indicators).find(c=>c.series.some(s=>s.id===id)):null;
  const target=card?document.getElementById('leading-detail-'+card.series[0].id):document.querySelector('[data-leading-group="'+group+'"]');
  target?.focus();target?.scrollIntoView({block:'nearest'});
}
function bindLeadingOverview(){
  document.querySelectorAll('[data-leading-overview]').forEach(b=>b.addEventListener('click',()=>{leadingState.overview=b.dataset.leadingOverview;drawLeading();}));
  $('leading-content').addEventListener('click',e=>{
    const target=e.target.closest('[data-leading-open-group]');
    if(target)leadingOpenDetail(target.dataset.leadingOpenGroup,target.dataset.leadingOpen);
  });
  $('leading-content').addEventListener('keydown',e=>{
    const cell=e.target.closest('[data-leading-heat]');if(!cell)return;
    if(e.key==='Enter'||e.key===' '){e.preventDefault();leadingOpenDetail(cell.dataset.leadingOpenGroup,cell.dataset.leadingOpen);return;}
    const moves={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]};
    if(!moves[e.key])return;e.preventDefault();
    const [row,col]=cell.dataset.leadingHeat.split(':').map(Number),[dy,dx]=moves[e.key];
    const table=cell.closest('table'),next=table.querySelector(`[data-leading-heat="${row+dy}:${col+dx}"]`);
    if(next){table.querySelectorAll('[data-leading-heat]').forEach(c=>c.tabIndex=-1);next.tabIndex=0;next.focus();}
  });
  const inspect=e=>{
    const cell=e.target.closest('[data-leading-heat]');if(!cell)return;
    $('leading-heat-inspection').textContent=cell.dataset.inspect;
  };
  $('leading-content').addEventListener('focusin',inspect);
  $('leading-content').addEventListener('mouseover',inspect);
}
