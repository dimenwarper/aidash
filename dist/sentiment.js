"use strict";
const sentimentState={market:'all',view:'attitudes'};
function sentimentSeries(){return Object.values(state.data.leading_indicators?.series||{}).filter(s=>s.group==='sentiment');}
function sentimentCards(series){
  const cards=new Map();
  series.forEach(s=>{
    const key=(s.chart_id||s.id)+'|'+s.unit+'|'+s.survey_family;
    if(!cards.has(key))cards.set(key,{title:s.chart_title||s.name,group:'sentiment',series:[]});
    cards.get(key).series.push({...s,points:s.points.filter(p=>p[0].slice(0,7)<=state.month)});
  });
  return [...cards.values()];
}
function drawSentiment(){
  const series=sentimentSeries(),source=state.data.leading_indicators?.sources?.find(s=>s.source==='leading-sentiment');
  const attitudes=series.filter(s=>s.topic!=='data-centers'),centers=series.filter(s=>s.topic==='data-centers');
  document.querySelectorAll('[data-sentiment-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sentimentView===sentimentState.view)));
  $('sentiment-view-attitudes').hidden=sentimentState.view!=='attitudes';
  $('sentiment-view-data-centers').hidden=sentimentState.view!=='data-centers';
  $('sentiment-status').hidden=source?.status==='success';
  $('sentiment-status').textContent=series.length?'The latest sentiment import did not succeed. Showing the last reviewed snapshot.':'No survey snapshot loaded. Run the sentiment refresh and rebuild the dashboard.';
  const waves=[...new Set((sentimentState.view==='data-centers'?centers:attitudes).flatMap(s=>s.points.filter(p=>p[0].slice(0,7)<=state.month).map(p=>s.survey_family+'|'+p[0])))];
  $('sentiment-coverage').textContent=`${waves.length} survey waves · through ${monthName(state.month)}`;
  const markets=[...new Map(attitudes.filter(s=>s.survey_family==='ipsos').map(s=>[s.market,s.geography])).entries()];
  if(!markets.some(([id])=>id===sentimentState.market))sentimentState.market='all';
  $('sentiment-market').innerHTML='<option value="all">All selected countries</option>'+markets.map(([id,name])=>`<option value="${escapeHTML(id)}">${escapeHTML(name)}</option>`).join('');
  $('sentiment-market').value=sentimentState.market;
  const us=sentimentCards(attitudes.filter(s=>s.survey_family==='pew'));
  const international=sentimentCards(attitudes.filter(s=>s.survey_family==='ipsos' && (sentimentState.market==='all'||s.market===sentimentState.market)));
  const empty='<p class="leading-empty">No reviewed survey observations available.</p>';
  $('sentiment-us').innerHTML=us.map(card=>leadingCardHTML(card,'sentiment-detail-')).join('')||empty;
  $('sentiment-international').innerHTML=international.map(card=>leadingCardHTML(card,'sentiment-detail-')).join('')||empty;
  $('sentiment-data-centers').innerHTML=sentimentCards(centers).sort((a,b)=>(a.series[0].view_order??10)-(b.series[0].view_order??10)).map(card=>sentimentDataCenterCard(card,'sentiment-detail-')).join('')||empty;
}
function sentimentDataCenterCard(card,idPrefix='leading-detail-'){
  const dates=[...new Set(card.series.flatMap(s=>s.points.map(p=>p[0])))].sort();
  const history=card.series.some(s=>s.points.length>1);
  const alerts=[...new Set(card.series.map(s=>s.alert).filter(Boolean))];
  return `<article class="leading-card sentiment-snapshot" id="${escapeHTML(idPrefix+card.series[0].id)}" tabindex="-1"><div class="leading-card-top"><span>${escapeHTML(card.series[0].source_name)}</span><span>${history?'Survey history':'Survey snapshot'}</span></div><h4>${escapeHTML(card.title)}</h4><p class="leading-units">${escapeHTML(card.series[0].population)} · ${dates.length?escapeHTML(leadingDate(dates.at(-1),'survey')):'No observations in range'}</p>${alerts.map(a=>`<p class="leading-alert">${escapeHTML(a)}</p>`).join('')}<div class="sentiment-bars">${card.series.map((s,i)=>{
    const p=s.points.at(-1);
    return `<div class="sentiment-bar-row"><span>${escapeHTML(s.legend||s.name)}</span><strong>${p?escapeHTML(leadingNumber(p[1]))+'%':'—'}</strong><div class="sentiment-bar-track" aria-hidden="true"><i style="width:${p?p[1]:0}%;background:${history?leadingColors[i%leadingColors.length]:leadingColors[0]}"></i></div></div>`;
  }).join('')}</div><p class="sentiment-snapshot-note">${!dates.length?'No observations in this date range.':history?'Latest values above; available survey history below.':'One survey wave; no time trend yet.'} Bars use a 0–100% scale.</p>${history?leadingChart(card):''}${leadingSourceDetails(card)}</article>`;
}
function bindSentimentControls(){
  $('sentiment-market').addEventListener('change',e=>{sentimentState.market=e.target.value;drawSentiment();});
  document.querySelectorAll('[data-sentiment-view]').forEach(b=>b.addEventListener('click',()=>{sentimentState.view=b.dataset.sentimentView;drawSentiment();}));
}
