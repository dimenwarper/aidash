"use strict";

const explorer={product:"8542",origin:"all",tradeYear:null,node:"trumpf_ditzingen"};
const activityGlobes={};
function globeZoomChanged(view,zoom) {
  $(view+"-zoom-reset").textContent=number(zoom,1)+"×";
  $(view+"-zoom-reset").setAttribute("aria-label","Reset zoom to 1×; current zoom "+number(zoom,1)+"×");
  $(view+"-zoom-out").disabled=zoom<=1;$(view+"-zoom-in").disabled=zoom>=5;
}

function options(id, items, selected) {
  $(id).innerHTML=items.map(([value,label])=>`<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`).join("");
  $(id).value=selected;$(id).disabled=!items.length;
}
function yearChange(points,point) {
  if(!point) return null;
  // Match the same calendar month/quarter, including leap-year month ends.
  const prior=points.find(p=>Number(p[0].slice(0,4))===Number(point[0].slice(0,4))-1 && p[0].slice(5,7)===point[0].slice(5,7));
  return prior && prior[1]>0 ? (point[1]/prior[1]-1)*100 : null;
}
function valueChainPoints(series) {
  const cutoff=state.supplyView==="trade"?explorer.tradeYear+"-12":null;
  return visiblePoints(series).filter(p=>!cutoff || p[0].slice(0,7)<=cutoff);
}
function syncSupplyGlobe() {
  for(const [view,globe] of Object.entries(activityGlobes)) globe.setActive(state.active==="supply-chain" && state.supplyView===view);
}
function activityMap(view,locations,routes=[]) {
  if(typeof SupplyGlobe==="undefined") return;
  if(!activityGlobes[view]) {
    try {
      activityGlobes[view]=new SupplyGlobe($(view+"-globe"),{
        locations,routes,
        onSelect:id=>{explorer.origin=id;drawSupply();activityGlobes[view].select(id,true);if(view==="trade") activityGlobes[view].select(state.supply);},
        onMotion:running=>{$(view+"-motion").textContent=running?"Pause rotation":"Resume rotation";},
        onZoom:zoom=>globeZoomChanged(view,zoom),
        onRouteSelect:id=>{state.supply=id;drawSupply();},
        onError:()=>{$(view+"-error").hidden=false;},
      });
    } catch { $(view+"-error").hidden=false;$(view+"-motion").disabled=true;return; }
  }
  activityGlobes[view].setData(locations,routes);
  activityGlobes[view].setActive(state.active==="supply-chain" && state.supplyView===view);
  activityGlobes[view].select(state.supply);
}
function setPeriodSlider(id,periods,current,format) {
  if(!periods.includes(current)) current=periods.at(-1) || null;
  $(id).min=0;$(id).max=Math.max(0,periods.length-1);$(id).value=Math.max(0,periods.indexOf(current));$(id).disabled=periods.length<2;
  $(id+"-label").textContent=current?format(current):"Unavailable";
  $(id).setAttribute("aria-valuetext",current?format(current):"Unavailable");
  return current;
}
function prepareSupplyView() {
  $("supply-layout").classList.toggle("euv-layout",state.supplyView==="euv");
  for(const view of ["trade","euv"]) $("supply-view-"+view).hidden=state.supplyView!==view;
  syncSupplyGlobe();
  if(state.supplyView==="trade") drawTradeExplorer();
  if(state.supplyView==="euv") drawEuvExplorer();
}
function tradeEntries() { return Object.entries(state.data.supply_chain || {}).filter(([,s])=>s.group==="trade"); }
function tradePeriods() { return [...new Set(tradeEntries().flatMap(([,s])=>visiblePoints(s).map(p=>p[0].slice(0,4))))].sort(); }
function drawTradeExplorer() {
  const trade=state.data.trade || {},all=tradeEntries(),areas=trade.geographies || [];
  explorer.tradeYear=setPeriodSlider("trade-period",tradePeriods(),explorer.tradeYear,x=>x);
  $("trade-product").innerHTML=["Chips & equipment","Materials"].map(group=>`<optgroup label="${group}">${(trade.commodities || []).filter(c=>(c.group || "Chips & equipment")===group).map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)} · HS ${escapeHTML(c.id)}</option>`).join("")}</optgroup>`).join("");
  $("trade-product").value=explorer.product;
  options("trade-origin",[["all","All exporting areas"],...areas.map(g=>[g.id,g.name])],explorer.origin);
  const selected=all.filter(([,s])=>s.commodity===explorer.product && (explorer.origin==="all" || s.origin===explorer.origin));
  const reading=s=>visiblePoints(s).find(p=>p[0].slice(0,4)===explorer.tradeYear);
  selected.sort((a,b)=>(reading(b[1])?.[1] ?? -1)-(reading(a[1])?.[1] ?? -1));
  if(!selected.some(([id])=>id===state.supply)) state.supply=selected[0]?.[0] || "";
  options("trade-route",selected.map(([id,s])=>{const p=reading(s);return [id,s.name+" · "+(p?valueLabel(p[1],s.unit):"Unavailable in "+explorer.tradeYear)];}),state.supply);
  const measured=selected.filter(([,s])=>reading(s));
  const drawn=measured.slice(0,8);
  const active=measured.find(([id])=>id===state.supply);
  if(active && !drawn.includes(active)) drawn.push(active);
  const nodes=new Set(drawn.flatMap(([,s])=>[s.origin,s.destination]));
  activityMap("trade",areas.filter(g=>nodes.has(g.id)).map(g=>({id:g.id,coordinates:[g.lon,g.lat],label:g.name})),drawn.map(([id,s])=>{
    const value=valueLabel(reading(s)[1],s.unit);
    return {id,from:s.from_coordinates,to:s.to_coordinates,label:s.name,valueLabel:value,annotation:value+" · "+explorer.tradeYear,tooltip:s.name+" · "+value+" exports · "+explorer.tradeYear};
  }));
  $("trade-edges").innerHTML=drawn.map(([id,s])=>`<button data-trade-edge="${escapeHTML(id)}" aria-pressed="${state.supply===id}"><span>${escapeHTML(s.name)}</span><strong>${valueLabel(reading(s)[1],s.unit)}</strong><small>${explorer.tradeYear} · exports</small></button>`).join("") || '<p class="data-note">No measured routes for this year and selection.</p>';
  $("trade-edge-summary").textContent="Visible route annotations · "+drawn.length;
  $("trade-edges").querySelectorAll("[data-trade-edge]").forEach(button=>button.addEventListener("click",()=>{state.supply=button.dataset.tradeEdge;drawSupply();$("trade-edges").querySelector(`[data-trade-edge="${state.supply}"]`)?.focus({preventScroll:true});}));
  const evidence=all.filter(([,s])=>s.commodity===explorer.product).flatMap(([,s])=>Object.values(s.evidence || {})).find(e=>e.coverage?.year===explorer.tradeYear);
  const coverage=evidence?.coverage;
  $("trade-coverage").textContent=(coverage?`${coverage.reporter_count}/${coverage.expected} selected reporters available for this product in ${explorer.tradeYear}. `:"")+(coverage?.missing.length?"Unreported: "+coverage.missing.join(", ")+". ":"")+`${measured.length} measured routes match these filters. Map shows the eight largest and the selected route. Arrows show export direction; labels show USD value. Line thickness highlights selection. Missing flows are unavailable, not zero.`;
  $("trade-area-note").textContent=drawn.some(([,s])=>s.origin==="490" || s.destination==="490")?areas.find(g=>g.id==="490")?.location_note || "":"Selected bilateral exports; locations represent economies and areas, not ports or factories.";
}
function drawEuvExplorer() {
  const euv=state.data.euv || {},nodes=euv.nodes || [];
  if(!nodes.some(n=>n.id===explorer.node)) explorer.node=nodes[0]?.id || "";
  $("euv-components").innerHTML=euvMachineSVG(explorer.node);
  const selectedPart=euvPartForNode(explorer.node);
  options("euv-component",EUV_PARTS.map(part=>[part.id,part.name]),selectedPart.id);
  const locations=nodes.filter(node=>selectedPart.nodes.includes(node.id));
  options("euv-location",locations.map(node=>[node.id,node.company+" · "+node.city]),explorer.node);
  $("euv-components").querySelectorAll("[data-euv-part]").forEach(target=>{
    const activate=()=>{selectEuvPart(target.dataset.euvPart);$("euv-components").querySelector(`[data-euv-part="${target.dataset.euvPart}"]`)?.focus({preventScroll:true});};
    target.addEventListener("click",activate);
    target.addEventListener("keydown",event=>{if(event.key==="Enter" || event.key===" "){event.preventDefault();activate();}});
  });
  const node=nodes.find(n=>n.id===explorer.node);
  const ids=(node?.series_ids || []).filter(id=>state.data.supply_chain[id]);
  if(!ids.includes(state.supply)) state.supply=ids[0] || "";
  options("euv-series",ids.map(id=>[id,state.data.supply_chain[id].name]),state.supply);
  if(!ids.length) $("euv-series").innerHTML='<option>No public numeric series in coverage</option>';
}
function eventByMonth(event) {
  // Unknown day/month never becomes an invented January announcement date.
  return event.date.length===4?event.date<state.month.slice(0,4):event.date.slice(0,7)<=state.month;
}
function drawSupplyContext(series,points,point) {
  const container=$("supply-context");
  if(!["trade","euv"].includes(state.supplyView)) return;
  const change=yearChange(points,point);
  let html=point?`<div class="activity-change"><span>Year over year</span><strong>${change===null?"Unavailable":signed(change,1)+"%"}</strong></div>`:"";
  if(series?.period_basis?.startsWith("annual, fiscal") && point) $("supply-period").textContent="FY ended "+formatDate(point[0],{month:"short",year:"numeric"});
  if(series?.reviewed_at) html+=`<p class="data-note">Companywide history · filings reviewed ${formatDate(series.reviewed_at)}. New filings require review before inclusion.</p>`;
  if(state.supplyView==="trade") {
    if(!point) $("supply-period").textContent="Unavailable in "+explorer.tradeYear;
    const edition=point?series.evidence?.[point[0]]?.classification:null;
    if(edition) html+=`<p class="data-note">Reported classification: ${escapeHTML(edition)}. HS editions may change across years.</p>`;
    const commodity=state.data.trade?.commodities.find(c=>c.id===explorer.product);
    if(commodity?.uses) html+=`<div class="material-context"><h4>Where it is used</h4><p>${escapeHTML(commodity.uses)}</p><div class="source-links">${(commodity.sources || []).filter(s=>s.type!=="classification" || s.title.includes("2022")).map(s=>externalLink(s.url,s.title)).join("")}</div></div>`;
  }
  if(state.supplyView==="euv") {
    const euv=state.data.euv || {},node=euv.nodes?.find(n=>n.id===explorer.node);
    if(node) {
      if(!series) {$("supply-name").textContent=node.company+" · "+node.component;$("supply-geography").textContent=node.city+", "+node.country;}
      html+=`<div class="component-detail"><h4>${escapeHTML(node.name)}</h4><p>${escapeHTML(node.scope)}</p><div class="source-links">${node.sources.map(s=>externalLink(s.url,s.title)).join("")}</div>`;
      const edges=(euv.edges || []).filter(e=>e.from===node.id || e.to===node.id);
      html+=edges.map(e=>`<p class="dependency-link">${escapeHTML(euv.nodes.find(n=>n.id===e.from)?.company)} → ${escapeHTML(euv.nodes.find(n=>n.id===e.to)?.company)}<br><strong>${escapeHTML(e.label)}</strong> · ${escapeHTML(e.kind.replaceAll("_"," "))} ${e.sources.map(s=>externalLink(s.url,"Evidence")).join(" ")}</p>`).join("");
      if(!edges.length) html+='<p class="data-note">No named supplier/customer relationship verified in this catalogue.</p>';
      const events=(euv.milestones || []).filter(e=>e.node_ids.includes(node.id) && eventByMonth(e));
      const undated=(euv.milestones || []).filter(e=>e.node_ids.includes(node.id) && e.date.length===4 && e.date===state.month.slice(0,4));
      if(events.length) html+='<h4 class="milestone-heading">Disclosed events</h4>'+events.map(e=>`<div class="equipment-event"><div><span class="record-tag">${{actual:"Reported completed",planned:"Announced plan",in_progress:"In progress"}[e.status] || escapeHTML(e.status)}</span><time>${e.date.length===4?e.date:formatDate(e.date)}</time></div><strong>${escapeHTML(e.title)}</strong><p>${escapeHTML(e.detail)}</p>${externalLink(e.source_url,"Source")}</div>`).join("");
      if(undated.length) html+=`<details class="memory-disclosures"><summary>${state.month.slice(0,4)} announcements with an unspecified month</summary><p class="data-note">Excluded from the monthly event list; the announcement month is not confirmed.</p>${undated.map(e=>`<p><strong>${escapeHTML(e.title)}</strong><br>Announced plan · ${escapeHTML(e.detail)}<br>${externalLink(e.source_url,"Source")}</p>`).join("")}</details>`;
      html+='</div>';
    }
  }
  container.innerHTML=html;
}
function selectEuvPart(id) {
  const part=EUV_PARTS.find(part=>part.id===id);
  if(!part) return;
  if(!part.nodes.includes(explorer.node)) explorer.node=part.nodes[0];
  state.supply="";drawSupply();
}
function bindSupplyControls() {
  for(const control of ["in","out","reset"]) $("trade-zoom-"+control).addEventListener("click",()=>{const globe=activityGlobes.trade;if(globe) globe.setZoom(control==="reset"?1:globe.zoom*(control==="in"?1.25:1/1.25));});
  $("trade-motion").addEventListener("click",()=>{const globe=activityGlobes.trade;if(globe) globe.setRunning(!globe.running);});
  for(const [id,key] of [["trade-product","product"],["trade-origin","origin"]]) $(id).addEventListener("change",event=>{explorer[key]=event.target.value;drawSupply();if(key==="origin") {activityGlobes.trade?.select(explorer.origin,true);activityGlobes.trade?.select(state.supply);}});
  for(const id of ["trade-route","euv-series"]) $(id).addEventListener("change",event=>{state.supply=event.target.value;drawSupply();});
  $("trade-period").addEventListener("input",event=>{explorer.tradeYear=tradePeriods()[Number(event.target.value)];drawSupply();});
  $("euv-location").addEventListener("change",event=>{explorer.node=event.target.value;state.supply="";drawSupply();});
  $("euv-component").addEventListener("change",event=>selectEuvPart(event.target.value));
}

// A changing reporter set can create false trade trends. Each product keeps
// only directed routes with an explicit observation in every visible year.
function tradeOverviewSeries(commodity,entries=tradeEntries()) {
  const routes=entries.filter(([,series])=>series.commodity===commodity.id)
    .map(([id,series])=>({id,...series,observations:new Map(visiblePoints(series).filter(([,value])=>Number.isFinite(value)))}))
    .filter(route=>route.observations.size);
  const dates=[...new Set(routes.flatMap(route=>[...route.observations.keys()]))].sort();
  const matched=routes.filter(route=>dates.every(date=>route.observations.has(date)));
  const points=matched.length?dates.map(date=>[date,matched.reduce((sum,route)=>sum+route.observations.get(date),0)]):[];
  return {id:commodity.id,name:commodity.name,group:commodity.group || "Chips & equipment",frequency:"annual",unit:"usd",points,
    routes:matched.length,availableRoutes:routes.length,origins:new Set(matched.map(route=>route.origin)).size};
}

function supplyMiniChart(series) {
  const points=series.points;
  if(!points.length) return '<span class="supply-mini-empty">No comparable observations</span>';
  const width=320,height=66,pad=5,values=points.map(p=>p[1]),minimum=Math.min(...values),maximum=Math.max(...values);
  const first=parseDate(points[0][0]).valueOf(),last=parseDate(points.at(-1)[0]).valueOf();
  const x=day=>pad+(parseDate(day).valueOf()-first)/(last-first || 1)*(width-pad*2);
  const y=value=>maximum===minimum?height/2:height-pad-(value-minimum)/(maximum-minimum)*(height-pad*2);
  const ordinal=day=>Number(day.slice(0,4))*12+Number(day.slice(5,7));
  const interval=series.frequency==="annual"?12:series.frequency==="quarterly"?3:1;
  const path=points.map((p,i)=>`${!i || ordinal(p[0])-ordinal(points[i-1][0])>interval?"M":"L"}${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`).join(" ");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(series.name)} trend; each chart uses its own vertical scale"><path class="supply-mini-baseline" d="M${pad} ${height-pad} H${width-pad}"/><path class="supply-mini-line" d="${path}"/>${points.map((p,i)=>`<circle cx="${x(p[0]).toFixed(2)}" cy="${y(p[1]).toFixed(2)}" r="${points.length<10 || i===points.length-1?2.5:1.4}"><title>${escapeHTML(series.name)} · ${escapeHTML(periodLabel(p[0],series.frequency))}: ${escapeHTML(valueLabel(p[1],series.unit))}</title></circle>`).join("")}</svg>`;
}

function supplyOverviewCard(series,kind) {
  const latest=series.points.at(-1),change=yearChange(series.points,latest);
  const geography=kind==="trade"?`${series.origins} exporting areas`:series.geography_name || geographies[series.geography] || series.geography;
  const scope=kind==="trade"?`${series.routes} of ${series.availableRoutes} routes matched across years`:
    series.unit_label || ({semiconductors:"Index · 2017 = 100",memory:"Index · 2022 = 100"}[series.id]) ||
    ({usd_bn_saar:"Nominal $bn · annualized rate",usd_bn:"Nominal $bn per quarter"}[series.unit]) || series.unit;
  const action=kind==="trade"?"Explore routes for ":"Explore infrastructure history for ";
  return `<button type="button" class="supply-mini" data-overview-kind="${kind}" data-overview-id="${escapeHTML(series.id)}" aria-label="${escapeHTML(action+series.name)}"><span class="supply-mini-name">${escapeHTML(series.name)}<span aria-hidden="true">↗</span></span><span class="supply-mini-reading"><strong>${latest?valueLabel(latest[1],series.unit):"—"}</strong><span>${change===null?"YoY unavailable":signed(change,1)+"% YoY"}</span></span><span class="supply-mini-meta">${escapeHTML(geography || "")}${latest?" · "+periodLabel(latest[0],series.frequency):" · No observations"}</span>${supplyMiniChart(series)}<span class="supply-mini-axis"><span>${series.points.length>1?periodLabel(series.points[0][0],series.frequency):""}</span><span>${latest?periodLabel(latest[0],series.frequency):""}</span></span><span class="supply-mini-scope">${escapeHTML(scope)}</span></button>`;
}

function openSupplyOverviewDetail(kind,id) {
  if(kind==="trade") {
    const commodity=state.data.trade?.commodities.find(item=>item.id===id);
    if(!commodity) return;
    const series=tradeOverviewSeries(commodity);
    explorer.product=id;explorer.origin="all";explorer.tradeYear=series.points.at(-1)?.[0].slice(0,4) || null;state.supply="";
    setSupplyView("trade");$("trade-product").focus({preventScroll:true});
  } else if(kind==="infrastructure" && state.data.supply_chain?.[id]?.group==="infrastructure") {
    state.supply=id;setSupplyView("infrastructure");$("supply-name").focus({preventScroll:true});
  }
}

function drawSupplyOverview() {
  const infrastructure=Object.entries(state.data.supply_chain || {}).filter(([,series])=>series.group==="infrastructure")
    .map(([id,series])=>({...series,id,points:visiblePoints(series)}));
  const entries=tradeEntries(),products=(state.data.trade?.commodities || []).map(commodity=>tradeOverviewSeries(commodity,entries));
  const group=(id,name,items,kind)=>`<section class="supply-overview-group ${id}" aria-labelledby="${id}-heading"><div class="subheading"><h3 id="${id}-heading">${name}</h3><span class="meta">${kind==="trade"?"Annual exports · nominal USD":"Monthly & quarterly indicators"}</span></div><div class="supply-mini-grid">${items.map(series=>supplyOverviewCard(series,kind)).join("") || '<p class="empty-state">No series available in this snapshot.</p>'}</div></section>`;
  $("supply-view-overview").innerHTML=group("overview-infrastructure","AI infrastructure",infrastructure,"infrastructure")+
    group("overview-chip-trade","Trade · Chips & equipment",products.filter(series=>series.group==="Chips & equipment"),"trade")+
    group("overview-material-trade","Trade · Materials",products.filter(series=>series.group==="Materials"),"trade")+
    '<p class="supply-overview-note">Each chart uses its own vertical scale and shows all history through the selected month. Trade totals include only routes reported in every displayed year; excluded routes are not treated as zero. These are subsets of covered bilateral exports, not global totals. Select a chart to explore its history or trade routes.</p>';
  $("supply-view-overview").querySelectorAll("[data-overview-id]").forEach(button=>button.addEventListener("click",()=>openSupplyOverviewDetail(button.dataset.overviewKind,button.dataset.overviewId)));
}
