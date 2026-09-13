"use strict";

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const parseDate = (value) => new Date(value.slice(0, 10) + "T12:00:00Z");
const formatDate = (value, options = { month: "short", day: "numeric", year: "numeric" }) => parseDate(value).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
const monthName = (month) => formatDate(month + "-01", { month: "long", year: "numeric" });
const number = (value, decimals = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value);
const signed = (value, decimals = 2) => `${value < 0 ? "−" : "+"}${number(Math.abs(value), decimals)}`;
const previousMonth = (month) => { const day = parseDate(month + "-01"); day.setUTCMonth(day.getUTCMonth() - 1); return day.toISOString().slice(0, 7); };
const isHTTPS = (url) => { try { return new URL(url).protocol === "https:"; } catch { return false; } };
const sourceLink = (url) => isHTTPS(url) ? url : "https://europepmc.org/";
const state = { data: null, month: null, country: "US", range: "all", active: "overview", mathFilter: "all", jobView: "macro", jobScale:"indexed", macroSelected: ["ai", "postings", "employment"], trialCategory:"all", trialChart:"starts", supply: "trumpf_euv_revenue", supplyView: "overview" };
const adoptionColors = {adoption_manufacturing:"#315b72",adoption_trade:"#8c6746",adoption_transport:"#79587f",adoption_energy:"#426654",adoption_building:"#777332"};
const seriesColors = {ai:"#315b72",postings:"#8c6746",employment:"#426654",unemployment:"#79587f",participation:"#777332",openings:"#a15d54",earnings:"#427b80",quits:"#70665a",layoffs:"#383b40"};
const geographies = {US:"United States",KR:"South Korea",IE:"Ireland",EU27:"European Union",Global:"Global"};

function visiblePoints(series) { return (series?.points || []).filter(([date]) => date.slice(0, 7) <= state.month); }

function valueLabel(value, unit) {
  if (value === null || value === undefined) return "—";
  if (unit === "percent") return number(value, 2) + "%";
  if (unit === "thousand_jobs") return number(value / 1000, 2) + "m";
  if (unit === "usd_hour") return "$" + number(value, 2);
  if (unit === "usd_bn" || unit === "usd_bn_saar") return "$" + number(value, 1) + "bn";
  if (unit === "usd_tonne") return "$" + number(value);
  if (unit === "gwh") return number(value) + " GWh";
  if (unit === "twh") return number(value,1) + " TWh";
  if (unit === "usd_mn") return "$" + number(value / 1000,2) + "bn";
  if (unit === "usd") return "$" + (value>=1e9?number(value/1e9,2)+"bn":value>=1e6?number(value/1e6,1)+"m":value>=1000?number(value/1000,1)+"k":number(value,value>0 && value<1?2:0));
  if (unit === "eur_mn") return "€" + number(value) + "m";
  if (unit === "chf_mn") return "CHF " + number(value) + "m";
  if (unit === "twd_thousands") return "NT$" + number(value / 1e6,1) + "bn";
  if (unit === "thousand_wafers") return number(value/1000,2) + "m wafers";
  if (unit === "systems" || unit === "fte") return number(value);
  if (unit === "normalized") return number(value,1) + " / 100 (normalized)";
  return number(value, 1);
}

function periodLabel(day, frequency) {
  if (frequency === "annual") return day.slice(0, 4);
  if (frequency === "quarterly") return "Q" + Math.ceil(Number(day.slice(5, 7)) / 3) + " " + day.slice(0, 4);
  return frequency === "daily" ? formatDate(day) : formatDate(day, {month:"short",year:"numeric"});
}

function monthlyPoints(series) {
  const points = new Map();
  const currentMonth = (state.data.generated_at || new Date().toISOString()).slice(0, 7);
  for (const [day, value] of visiblePoints(series)) {
    const month = day.slice(0, 7);
    if (series.frequency === "daily" && month >= currentMonth) continue;
    points.set(month, [month + "-01", value]);
  }
  return [...points.values()];
}

function jobSeries() {
  return {ai:{name:"AI posting share", unit:"percent", frequency:"daily", points:pointsFor(state.country)}, ...(state.data.macro?.[state.country] || {})};
}

function indexedSeries(series, selected, range) {
  const available = selected.filter(id => series[id]).map(id => ({...series[id], id, points:monthlyPoints(series[id])}));
  let cutoff = "0000-00";
  const latest = available.flatMap(s => s.points.map(p=>p[0])).sort().at(-1);
  if (range !== "all" && latest) { const d = parseDate(latest); d.setUTCFullYear(d.getUTCFullYear() - Number(range)); cutoff = d.toISOString().slice(0, 7); }
  const common = available.length ? available[0].points.filter(([date, value]) => date.slice(0,7) >= cutoff && value > 0 && available.every(s => s.points.some(p => p[0] === date && p[1] > 0))) : [];
  const baseline = common[0]?.[0];
  if (!baseline) return {baseline:null, series:[]};
  return {baseline, series:available.map(s => {
    const base = s.points.find(p=>p[0] === baseline)[1];
    return {...s, color:seriesColors[s.id], points:s.points.filter(p=>p[0]>=baseline).map(([day,value])=>[day, value / base * 100])};
  })};
}

function normalizedJobSeries(series,selected,range) {
  const available=selected.filter(id=>series[id]).map(id=>({...series[id],id,points:monthlyPoints(series[id])}));
  if(!available.length || available.some(s=>!s.points.length)) return {baseline:null,end:null,series:[]};
  const end=available.map(s=>s.points.at(-1)[0]).sort()[0];
  let cutoff="0000-00";
  if(range!=="all") {const d=parseDate(end);d.setUTCFullYear(d.getUTCFullYear()-Number(range));cutoff=d.toISOString().slice(0,7);}
  const baseline=available[0].points.find(([day])=>day.slice(0,7)>=cutoff && day<=end && available.every(s=>s.points.some(p=>p[0]===day)))?.[0];
  if(!baseline) return {baseline:null,end,series:[]};
  return {baseline,end,series:available.map(s=>{
    const rawPoints=s.points.filter(p=>p[0]>=baseline && p[0]<=end),values=rawPoints.map(p=>p[1]),min=Math.min(...values),max=Math.max(...values);
    return {...s,color:seriesColors[s.id],rawPoints,points:rawPoints.map(([day,value])=>[day,max===min?50:(value-min)/(max-min)*100])};
  })};
}

// Shared dated-series chart. Segments stop at missing reporting periods.
function drawSeriesChart(id, series, {indexed=false, frequency="monthly", label="Time series", unit="index", zeroBaseline=false, domain=null} = {}) {
  const container = $(id), available = series.filter(s=>s.points.length);
  if (!available.length) { container.innerHTML = '<div class="empty-state">No observations for this selection.</div>'; return; }
  const values = available.flatMap(s=>s.points.map(p=>p[1])), dates = available.flatMap(s=>s.points.map(p=>parseDate(p[0]).valueOf()));
  const first = Math.min(...dates), last = Math.max(...dates);
  let min = Math.min(...values), max = Math.max(...values);
  const pad = (max-min || max*.1 || 1) * .12;
  min = zeroBaseline ? 0 : Math.max(0, min-pad); max += pad;
  if(domain) [min,max]=domain;
  const currencyAxis=!indexed && ["usd","usd_mn","twd_thousands"].includes(unit);
  const w = Math.max(260,container.clientWidth), h = 285, m = {left:currencyAxis?86:49,right:19,top:22,bottom:32};
  const x = day => m.left + (parseDate(day).valueOf()-first)/(last-first || 1)*(w-m.left-m.right);
  const y = value => h-m.bottom - (value-min)/(max-min)*(h-m.top-m.bottom);
  const xLabel = stamp => new Date(stamp).toLocaleDateString("en-US",{month: frequency!=="annual" && last-first < 63072000000 ? "short" : undefined,year:frequency==="annual" ? "numeric" : "2-digit",timeZone:"UTC"});
  let grid = "";
  for(let i=0;i<5;i++) { const v=min+(max-min)*i/4; grid += `<line class="chart-grid" x1="${m.left}" x2="${w-m.right}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.left-9}" y="${y(v)+4}" text-anchor="end">${currencyAxis?valueLabel(v,unit):number(v,max < 20 ? 1 : 0)}</text>`; }
  const firstYear=new Date(first).getUTCFullYear(), lastYear=new Date(last).getUTCFullYear();
  const ticks = first===last ? 1 : frequency==="annual" && lastYear-firstYear<10 ? lastYear-firstYear+1 : 4;
  for(let i=0;i<ticks;i++) {
    const stamp=frequency==="annual" && lastYear-firstYear<10 ? Date.UTC(firstYear+i,11,31,12) : first+(last-first)*i/Math.max(1,ticks-1);
    const xpos=m.left+(stamp-first)/(last-first || 1)*(w-m.left-m.right);
    grid += `<text x="${xpos}" y="${h-7}" text-anchor="${i===0?'start':i===ticks-1?'end':'middle'}">${xLabel(stamp)}</text>`;
  }
  if(indexed && min<=100 && max>=100) grid += `<line x1="${m.left}" x2="${w-m.right}" y1="${y(100)}" y2="${y(100)}" stroke="#9faaa9" stroke-dasharray="3 3"/>`;
  const ordinal = day => Number(day.slice(0,4))*12 + Number(day.slice(5,7));
  const expected = frequency === "annual" ? 12 : frequency === "quarterly" ? 3 : 1;
  const paths = available.map(s=>{
    const color=s.color || "#315b72";
    const path=s.points.map((p,i)=>`${!i || ordinal(p[0])-ordinal(s.points[i-1][0])>expected ? "M":"L"}${x(p[0])},${y(p[1])}`).join(" ");
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>` + s.points.map(p=>`<circle cx="${x(p[0])}" cy="${y(p[1])}" r="${frequency==='annual' ? 4 : 2}" fill="${color}"><title>${escapeHTML(s.name)} · ${periodLabel(p[0],frequency)}: ${indexed ? number(p[1],1) + " (indexed)" : valueLabel(p[1],unit)}${s.rawPoints?" · Original: "+valueLabel(s.rawPoints.find(raw=>raw[0]===p[0])?.[1],s.unit):""}</title></circle>`).join("");
  }).join("");
  container.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(label)}">${grid}${paths}</svg>`;
}

function drawMacroCards() {
  const data = state.data.macro?.[state.country] || {};
  $("macro-coverage").textContent = state.country === "US" ? "BLS & Indeed · reference dates shown separately" : "Indeed & OECD · unemployment reporting lags vary";
  $("macro-cards").innerHTML = Object.entries(data).map(([id,series])=>{
    const pts=visiblePoints(series), p=pts.at(-1);
    let change="";
    if(p && id==="employment") { const prior=pts.find(v=>v[0].startsWith(previousMonth(p[0].slice(0,7)))); if(prior) change=signed((p[1]-prior[1])*1000,0)+" jobs vs. prior month"; }
    if(p && id==="earnings") { const prior=pts.find(v=>v[0].slice(0,7)===String(Number(p[0].slice(0,4))-1)+p[0].slice(4,7)); if(prior?.[1]) change=signed((p[1]/prior[1]-1)*100,1)+"% year over year"; }
    return `<article class="macro-card"><span>${escapeHTML(series.name)}</span><strong>${p ? valueLabel(p[1],series.unit) : "—"}</strong><span class="meta">${p ? periodLabel(p[0],series.frequency) : "No observations"}${change ? " · "+change : ""}</span><details><summary>Definition &amp; source</summary><p>${escapeHTML(series.note)}</p>${externalLink(series.url,"Source data")}</details></article>`;
  }).join("") || '<div class="empty-state">Macro data is unavailable.</div>';
}

function drawMacroOverlay() {
  const series = jobSeries();
  const usable = Object.keys(series).filter(id=>monthlyPoints(series[id]).length);
  const selected = state.macroSelected.filter(id=>usable.includes(id));
  if (state.macroSelected.includes("employment") && !series.employment && usable.includes("unemployment") && !selected.includes("unemployment")) selected.push("unemployment");
  if (!selected.length && usable.length) selected.push(usable[0]);
  const options = $("macro-options");
  options.innerHTML = Object.entries(series).map(([id,s])=>`<label style="--series-color:${seriesColors[id]}"><input type="checkbox" value="${id}" ${selected.includes(id)?"checked":""} ${usable.includes(id)?"":"disabled"}><i></i>${escapeHTML(s.name)}${usable.includes(id)?"":" (unavailable)"}</label>`).join("");
  options.querySelectorAll("input").forEach(input=>input.addEventListener("change",()=>{
    state.macroSelected = [...options.querySelectorAll("input:checked")].map(el=>el.value);
    if (!state.macroSelected.length) state.macroSelected=[input.value];
    drawJobs();
    options.querySelector(`input[value="${input.value}"]`)?.focus({preventScroll:true});
  }));
  const normalized=state.jobScale==="normalized",scaled=normalized?normalizedJobSeries(series,selected,state.range):indexedSeries(series,selected,state.range);
  drawSeriesChart("jobs-chart", scaled.series, {indexed:!normalized,unit:normalized?"normalized":"index",domain:normalized?[0,100]:null,label:normalized?"Selected labor-market series normalized to their own 0 to 100 range over a common window":"AI share and labor-market indicators, rebased to the same month"});
  $("job-period").textContent=scaled.baseline?(normalized?"Normalized 0–100 · "+monthName(scaled.baseline.slice(0,7))+" – "+monthName(scaled.end.slice(0,7)):"Index · "+monthName(scaled.baseline.slice(0,7))+" = 100"):"No common reference window for selected series";
  $("jobs-method").textContent=(normalized?"Each series’ minimum is 0 and maximum is 100 over the same displayed window. This compares shapes, not magnitudes; flat series sit at 50. Hover points for original values. ":"Relative change from the same starting month. ")+"Daily series use the last observation of each completed month; official series use their reference month. Gaps stay missing. These trends do not isolate AI’s effect on jobs.";
}

function miniTrend(points) {
  if(points.length < 2) return "";
  const vals=points.map(p=>p[1]), min=Math.min(...vals), span=Math.max(...vals)-min || 1;
  const start=parseDate(points[0][0]).valueOf(), end=parseDate(points.at(-1)[0]).valueOf();
  const path=points.map((p,i)=>`${i?'L':'M'}${(parseDate(p[0]).valueOf()-start)/(end-start || 1)*65},${23-(p[1]-min)/span*21}`).join(" ");
  return `<svg class="chain-spark" viewBox="0 0 65 25" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
}

function setSupplyView(view) {
  if (!["overview","infrastructure","adoption","trade","euv"].includes(view)) return;
  state.supplyView=view;
  if(view==="overview") {drawSupply();return;}
  const data=state.data.supply_chain || {};
  const currentGroup=data[state.supply]?.group;
  if(currentGroup!==view && !(view==="adoption" && currentGroup==="operations")) {
    state.supply=Object.keys(data).find(id=>data[id].group===view) || "";
  }
  drawSupply();
}

function drawAdoptionComparison() {
  const series=Object.entries(state.data.supply_chain || {}).filter(([,s])=>s.group==="adoption")
    .map(([id,s])=>({...s,id,name:s.stage,points:visiblePoints(s),color:adoptionColors[id]}));
  drawSeriesChart("adoption-chart",series,{frequency:"annual",unit:"percent",zeroBaseline:true,label:"EU enterprises using AI by industry, annual percentage time series. No observation in 2022."});
}

function drawSupply() {
  const data = state.data.supply_chain || {};
  document.querySelectorAll("[data-supply-view]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.supplyView===state.supplyView)));
  const overview=state.supplyView==="overview";
  $("supply-layout").hidden=overview;
  for(const view of ["overview","trade","euv","infrastructure","adoption"]) $("supply-view-"+view).hidden=state.supplyView!==view;
  if(overview) {
    if(typeof syncSupplyGlobe==="function") syncSupplyGlobe();
    drawSupplyOverview();return;
  }
  for(const group of ["infrastructure","adoption"]) {
    $("supply-view-"+group).hidden=group!==state.supplyView;
    const container=$("chain-"+group);
    container.innerHTML=Object.entries(data).filter(([,s])=>s.group===group).map(([id,s])=>{
      const pts=visiblePoints(s), p=pts.at(-1);
      if(group==="adoption") return `<button class="adoption-series-button" data-supply="${id}" aria-pressed="${state.supply===id}"><i style="background:${adoptionColors[id]}" aria-hidden="true"></i><span>${escapeHTML(s.stage)}</span><strong>${p?valueLabel(p[1],s.unit):"—"}</strong><span class="meta">${p?periodLabel(p[0],s.frequency):"Unavailable"}</span></button>`;
      return `<button class="chain-card" data-supply="${id}" aria-pressed="${state.supply===id}"><span class="chain-stage">${escapeHTML(s.stage)}</span><span class="chain-measure">${escapeHTML(s.name)}</span><strong>${p?valueLabel(p[1],s.unit):"—"}</strong>${miniTrend(pts.slice(-36))}<span class="meta">${escapeHTML(geographies[s.geography] || s.geography)} · ${p?periodLabel(p[0],s.frequency):"Unavailable"}</span></button>`;
    }).join("") || '<div class="empty-state">No observations available.</div>';
    container.querySelectorAll("[data-supply]").forEach(b=>b.addEventListener("click",()=>{state.supply=b.dataset.supply;drawSupply();container.querySelector(`[data-supply="${state.supply}"]`)?.focus({preventScroll:true});}));
  }
  if(typeof prepareSupplyView === "function") prepareSupplyView();
  if(state.supplyView==="adoption") drawAdoptionComparison();
  const s=data[state.supply];
  $("supply-context").innerHTML="";
  if(!s) { for(const id of ["supply-name","supply-stage","supply-geography","supply-period","supply-unit","supply-note","supply-source","supply-related"]) $(id).textContent="";$("supply-value").textContent="—";$("supply-chart").innerHTML='<div class="empty-state">No reported time series for this selection.</div>'; if(typeof drawSupplyContext === "function") drawSupplyContext(null,[],null);return; }
  const pts=typeof valueChainPoints === "function"?valueChainPoints(s):visiblePoints(s);
  const p=state.supplyView==="trade" && typeof explorer!=="undefined"?pts.find(p=>p[0].slice(0,4)===explorer.tradeYear):pts.at(-1);
  $("supply-stage").textContent=['adoption','operations'].includes(s.group) ? "Surveyed AI adoption" : s.refresh_mode || "Industry indicator";
  $("supply-geography").textContent=s.geography_name || geographies[s.geography] || s.geography;
  $("supply-name").textContent=s.stage+" · "+s.name;
  $("supply-value").textContent=p?valueLabel(p[1],s.unit):"—";
  $("supply-period").textContent=p?periodLabel(p[0],s.frequency):"No observations by selected month";
  $("supply-unit").textContent=s.unit_label || {percent:"Percent of enterprises",index:"Index · see definition below",usd_bn:"Nominal $bn per quarter",usd_bn_saar:"Nominal $bn · seasonally adjusted annual rate",gwh:"GWh per quarter",usd_tonne:"Nominal USD per metric ton"}[s.unit] || s.unit;
  $("supply-note").textContent=s.note;
  $("supply-source").innerHTML=externalLink(p?s.evidence?.[p[0]]?.url || s.url:s.url,"Source & definitions");
  drawSeriesChart("supply-chart",[{...s,points:pts}],{frequency:s.frequency,label:s.stage+": "+s.name,unit:s.unit});
  const relatedId=s.stage==="Manufacturing" ? "production" : s.stage==="Transport & storage" ? "logistics" : null;
  const related=relatedId && relatedId!==state.supply ? data[relatedId] : null;
  const rp=related?visiblePoints(related).at(-1):null;
  $("supply-related").innerHTML=related?`<span>${escapeHTML(related.name)}</span><strong>${rp?valueLabel(rp[1],related.unit):"—"}</strong><p class="data-note">${rp?periodLabel(rp[0],related.frequency)+" · ":""}Percent of all enterprises in this sector.</p><button class="text-button" data-related="${relatedId}">Explore history →</button>`:"";
  $("supply-related").querySelector("[data-related]")?.addEventListener("click",()=>{state.supply=relatedId;drawSupply();$("supply-name").focus({preventScroll:true});});
  if(typeof drawSupplyContext === "function") drawSupplyContext(s,pts,p);
}

function pointsFor(country) {
  return (state.data.jobs[country]?.points || []).filter(([date]) => date.slice(0, 7) <= state.month);
}

function countryMetric(country) {
  const points = pointsFor(country);
  const latest = points.at(-1);
  const prior = points.filter(([date]) => date.startsWith(previousMonth(state.month))).at(-1);
  const current = latest && latest[0].startsWith(state.month);
  return { points, latest, prior, current, change: current && prior ? latest[1] - prior[1] : null };
}

function drawJobs() {
  const metric = countryMetric(state.country);
  const country = state.data.jobs[state.country]?.name || geographies[state.country] || state.country;
  $("chart-country").textContent = country;
  $("job-value").textContent = metric.latest ? number(metric.latest[1], 2) + "%" : "—";
  $("job-delta").textContent = metric.change === null ? "Unavailable" : signed(metric.change) + " pp";
  $("job-delta-label").textContent = metric.change === null ? "in selected month" : "vs. " + formatDate(previousMonth(state.month) + "-01", { month: "long" });
  $("job-period").textContent = metric.latest ? "Daily · 7-day average · Through " + formatDate(metric.latest[0]) : "No observations available";
  const container = $("jobs-chart");
  drawMacroCards();
  $("macro-options").hidden = state.jobView !== "macro";
  $("jobs-scale-control").hidden=state.jobView!=="macro";
  if (state.jobView === "macro" && Object.keys(state.data.macro?.[state.country] || {}).length) { drawMacroOverlay(); return; }
  $("macro-options").innerHTML = "";
  $("jobs-method").textContent = "Seven-day trailing average. AI mentions measure demand for skills, not jobs created or lost. Source: Indeed Hiring Lab.";
  if (!metric.latest) { container.innerHTML = '<div class="empty-state">No data for this selection.</div>'; return; }
  let points = metric.points;
  if (state.range !== "all") {
    const cutoff = parseDate(metric.latest[0]); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - Number(state.range));
    points = points.filter(([date]) => parseDate(date) >= cutoff);
  }
  const w = Math.max(240, container.clientWidth), h = w < 450 ? 255 : 283;
  const m = { top: 27, right: 24, bottom: 31, left: 35 };
  const chartW = w - m.left - m.right, chartH = h - m.top - m.bottom;
  const first = parseDate(points[0][0]).valueOf(), last = parseDate(points.at(-1)[0]).valueOf();
  const maxValue = Math.max(...points.map((point) => point[1]));
  const tickStep = maxValue > 12 ? 5 : maxValue > 6 ? 2 : maxValue > 3 ? 1 : 0.5;
  const maximum = Math.max(tickStep, Math.ceil(maxValue / tickStep) * tickStep);
  const x = (date) => m.left + ((parseDate(date).valueOf() - first) / (last - first || 1)) * chartW;
  const y = (value) => m.top + chartH - value / maximum * chartH;
  const path = points.map(([date, value], i) => `${i ? "L" : "M"}${x(date).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  let grid = "";
  for (let value = 0; value <= maximum; value += tickStep) grid += `<line class="chart-grid" x1="${m.left}" x2="${w - m.right}" y1="${y(value)}" y2="${y(value)}"/><text x="${m.left - 9}" y="${y(value) + 4}" text-anchor="end">${value}${value === maximum ? "%" : ""}</text>`;
  const ticks = w < 450 ? 4 : 6;
  for (let i = 0; i < ticks; i++) {
    const date = new Date(first + (last - first) * i / (ticks - 1));
    const label = state.range === "1" ? date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) : String(date.getUTCFullYear());
    grid += `<text x="${m.left + chartW * i / (ticks - 1)}" y="${h - 7}" text-anchor="${i === 0 ? "start" : i === ticks - 1 ? "end" : "middle"}">${label}</text>`;
  }
  let annotation = "";
  const reference = "2022-11-30";
  if (parseDate(reference).valueOf() > first && parseDate(reference).valueOf() < last && w > 450) {
    annotation = `<line x1="${x(reference)}" x2="${x(reference)}" y1="${m.top + 30}" y2="${h - m.bottom}" stroke="#9faaa9" stroke-dasharray="3 4" stroke-width=".7"/><text class="chart-annotation" x="${x(reference) + 8}" y="${m.top + 20}">ChatGPT released</text>`;
  }
  container.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(country)}: AI mentioned in ${number(metric.latest[1], 2)} percent of job postings on ${escapeHTML(formatDate(metric.latest[0]))}"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#315b72" stop-opacity=".10"/><stop offset="1" stop-color="#315b72" stop-opacity=".01"/></linearGradient></defs>${grid}${annotation}<path class="chart-area" d="${path} L${x(points.at(-1)[0])},${h - m.bottom} L${x(points[0][0])},${h - m.bottom} Z"/><path class="chart-line" d="${path}"/><circle cx="${x(metric.latest[0])}" cy="${y(metric.latest[1])}" r="3.3" fill="#315b72"/><g id="chart-hover" visibility="hidden"><line class="hover-line" y1="${m.top}" y2="${h - m.bottom}"/><circle class="hover-dot" r="4"/></g><rect id="chart-hit" x="${m.left}" y="${m.top}" width="${chartW}" height="${chartH}" fill="transparent"/></svg><div class="chart-tooltip" hidden></div>`;
  const svg = container.querySelector("svg"), hit = container.querySelector("#chart-hit"), tooltip = container.querySelector(".chart-tooltip"), hover = container.querySelector("#chart-hover");
  function show(event) {
    const rect = svg.getBoundingClientRect();
    const cursor = Math.max(m.left, Math.min(w - m.right, (event.clientX - rect.left) * w / rect.width));
    const target = first + (cursor - m.left) / chartW * (last - first);
    let low = 0, high = points.length - 1;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (parseDate(points[mid][0]).valueOf() < target) low = mid + 1; else high = mid; }
    if (low > 0 && target - parseDate(points[low - 1][0]).valueOf() < parseDate(points[low][0]).valueOf() - target) low--;
    const point = points[low], xpos = x(point[0]);
    hover.setAttribute("visibility", "visible");
    hover.querySelector("line").setAttribute("x1", xpos); hover.querySelector("line").setAttribute("x2", xpos);
    hover.querySelector("circle").setAttribute("cx", xpos); hover.querySelector("circle").setAttribute("cy", y(point[1]));
    tooltip.innerHTML = `${formatDate(point[0])}<strong>${number(point[1], 2)}%</strong>`;
    tooltip.hidden = false;
    tooltip.style.left = Math.max(0, Math.min(w - tooltip.offsetWidth, xpos + 12)) + "px";
  }
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", (event) => { if (event.pointerType !== "touch") { tooltip.hidden = true; hover.setAttribute("visibility", "hidden"); } });
}

function sparkline(points, selected) {
  const values = points.slice(-365).filter((_, i) => i % 7 === 0);
  if (values.length < 2) return "";
  const min = Math.min(...values.map((v) => v[1])), max = Math.max(...values.map((v) => v[1]));
  const path = values.map((point, i) => `${i ? "L" : "M"}${(i / (values.length - 1) * 100).toFixed(1)},${(27 - (point[1] - min) / (max - min || 1) * 23).toFixed(1)}`).join(" ");
  return `<svg class="sparkline" viewBox="0 0 100 31" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" fill="none" stroke="${selected ? "#315b72" : "#8b9696"}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}

function drawCountries() {
  const names = { GB: "U. Kingdom", US: "United States" };
  const entries = Object.keys(state.data.jobs).map((code) => ({ code, ...countryMetric(code) })).filter((entry) => entry.latest).sort((a, b) => b.latest[1] - a.latest[1]);
  $("country-grid").innerHTML = entries.map((entry) => `<button class="country-card" data-country="${escapeHTML(entry.code)}" aria-pressed="${entry.code === state.country}" aria-label="Explore ${escapeHTML(state.data.jobs[entry.code].name)} job-posting history"><span class="country-name">${escapeHTML(names[entry.code] || state.data.jobs[entry.code].name)}</span><span class="country-value">${number(entry.latest[1], 2)}<span>%</span></span><span class="country-change">${entry.change === null ? "Unavailable" : signed(entry.change) + " pp this month"}</span>${sparkline(entry.points, entry.code === state.country)}</button>`).join("");
  const dates = [...new Set(entries.map((entry) => entry.latest[0]))];
  $("country-asof").textContent = !dates.length ? "No source observations available" : dates.length === 1 ? "As of " + formatDate(dates[0]) : "Latest available dates vary by country";
  $("country-grid").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    state.country = button.dataset.country; $("country-select").value = state.country; drawJobs(); drawCountries();

  }));
}

function healthData() {
  return state.data.health.filter((point) => point.date.slice(0, 7) <= state.month);
}

function drawHealth() {
  const values = healthData(), totals = values.filter((point) => point.specialty === null);
  const last = totals.at(-1), cumulative = totals.reduce((sum, point) => sum + point.value, 0);
  $("health-count").textContent = last ? number(cumulative) : "—";
  $("health-count-period").textContent = last ? "through " + formatDate(last.date, { month: "short", year: "numeric" }) : "No observations";
  $("health-lag").textContent = last ? "Latest decisions on the list: " + formatDate(last.date, { month: "long", year: "numeric" }) : "No observations by the selected month";
  const years = new Map();
  totals.forEach((point) => { const year = point.date.slice(0, 4); years.set(year, (years.get(year) || 0) + point.value); });
  const recent = [...years.entries()].filter(([year]) => Number(year) >= 2018);
  const container = $("health-chart");
  const partialYear = last && last.date.slice(5, 7) !== "12";
  $("health-chart-period").textContent = recent.length ? recent[0][0] + "–" + recent.at(-1)[0] : "No observations";
  $("health-caption").textContent = (partialYear ? last.date.slice(0, 4) + " is partial. " : "") + "The list is not exhaustive and may be revised.";
  $("specialty-chart").innerHTML = "";
  if (!recent.length) { container.innerHTML = '<div class="empty-state">No source observations in this date range.</div>'; return; }
  const w = Math.max(230, container.clientWidth), h = 285, m = { left: 8, right: 8, top: 25, bottom: 39 };
  const gap = (w - m.left - m.right) / recent.length, bw = Math.min(30, gap * .65), maximum = Math.max(1, ...recent.map(([, value]) => value));
  const y = (value) => h - m.bottom - value / maximum * (h - m.top - m.bottom);
  let bars = `<line x1="${m.left}" x2="${w - m.right}" y1="${h - m.bottom}" y2="${h - m.bottom}" stroke="#aaa99f" stroke-width=".7"/>`;
  recent.forEach(([year, value], i) => {
    const xpos = m.left + i * gap + (gap - bw) / 2;
    const partial = last && year === last.date.slice(0, 4) && last.date.slice(5, 7) !== "12";
    bars += `<g><title>${year}: ${value} listed authorizations${partial ? ", partial through " + formatDate(last.date, { month: "long" }) : ""}</title><rect x="${xpos}" y="${y(value)}" width="${bw}" height="${h - m.bottom - y(value)}" fill="${partial ? "url(#partial-year)" : i === recent.length - 2 ? "#315b72" : "#9da9aa"}" ${partial ? 'stroke="#315b72" stroke-width=".6"' : ""}/><text x="${xpos + bw / 2}" y="${y(value) - 8}" text-anchor="middle" style="fill:#33352f;font-size:12px">${number(value)}</text><text x="${xpos + bw / 2}" y="${h - m.bottom + 20}" text-anchor="middle" style="font-size:12px">${w < 360 ? "’" + year.slice(2) : year}${partial ? "*" : ""}</text></g>`;
  });
  container.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Annual FDA listed AI authorizations. ${recent.map(([year, count]) => year + ': ' + count).join('. ')}. ${partialYear ? 'Latest year is partial.' : ''}"><defs><pattern id="partial-year" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(35)"><rect width="5" height="5" fill="#eef0eb"/><line x1="0" x2="0" y1="0" y2="5" stroke="#315b72" stroke-width="1.8"/></pattern></defs>${bars}</svg>`;
  const specialty = new Map();
  values.filter((point) => point.specialty !== null).forEach((point) => specialty.set(point.specialty, (specialty.get(point.specialty) || 0) + point.value));
  const sorted = [...specialty.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 3); top.push(["Other specialties", sorted.slice(3).reduce((sum, [, value]) => sum + value, 0)]);
  $("specialty-chart").innerHTML = cumulative > 0 ? top.map(([name, value]) => `<div class="specialty-row"><div><span>${escapeHTML(name)}</span><span>${number(value / cumulative * 100, 1)}%</span></div><div class="specialty-bar"><i style="width:${value / cumulative * 100}%"></i></div></div>`).join("") : '<p class="data-note">No specialty shares available.</p>';
}


const externalLink = (url, label) => isHTTPS(url) ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)} ↗</a>` : escapeHTML(label);
const displayDate = (value) => !value ? "Not reported" : value.length === 7 ? monthName(value) : formatDate(value);
const statusName = (value) => String(value || "Not reported").toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const phaseName = (phases) => phases.length ? phases.map((phase) => ({ EARLY_PHASE1: "Early 1", PHASE1: "1", PHASE2: "2", PHASE3: "3", PHASE4: "4", NA: "N/A" }[phase] || phase)).join("/") : "Not reported";

const trialCategoryNames={molecular_design:"Molecular design",target_selection:"Target selection",repurposing:"Repurposing",recruitment:"Recruitment",trial_analysis:"Trial analysis"};
const trialCategories=trial=>trial.ai_categories || state.data.trials?.programs?.find(p=>p.id===trial.program_id)?.ai_categories || ["molecular_design"];
const trialIncludedDate=trial=>trial.coverage_date || trial.start_date;
const trialMatchesCategory=trial=>state.trialCategory==="all" || trialCategories(trial).includes(state.trialCategory);
function countedTrials(applyFilter=true) {
  const eligible=(state.data.trials?.trials || []).filter(trial=>trial.start_type==="ACTUAL" && trial.start_date && trial.start_date.slice(0,7)<=state.month && trialIncludedDate(trial)?.slice(0,7)<=state.month && (!applyFilter || trialMatchesCategory(trial)));
  return [...new Map(eligible.map(trial=>[trial.id,trial])).values()];
}

function countedTrialOutcomes(trials=countedTrials()) {
  const eligible=new Map(trials.map(trial=>[trial.id,trial]));
  return (state.data.trials?.outcomes || []).filter(item=>item.date.slice(0,7)<=state.month && eligible.get(item.trial_id)?.program_id===item.program_id)
    .map(item=>({...item,count_date:[item.date,trialIncludedDate(eligible.get(item.trial_id))].sort().at(-1)}));
}

function successfulTrialOutcomes(outcomes,type) {
  // One trial per endpoint type; a newer mixed/negative readout replaces an
  // earlier success for that same endpoint type.
  const latest=new Map();
  outcomes.filter(item=>item.endpoint_type===type).sort((a,b)=>a.date.localeCompare(b.date)).forEach(item=>latest.set(item.trial_id,item));
  return [...latest.values()].filter(item=>item.outcome===`primary_${type}_met`);
}

function trialSuccessSeries(outcomes) {
  if(!outcomes.length) return [];
  const first=outcomes.map(item=>item.count_date.slice(0,7)).sort()[0];
  const series=[{name:"Efficacy endpoints met",color:"#315b72",type:"efficacy",points:[]},{name:"Positive safety readouts",color:"#426654",type:"safety",points:[]}];
  let month=previousMonth(first);
  while(month<=state.month) {
    const toDate=outcomes.filter(item=>item.count_date.slice(0,7)<=month);
    series.forEach(s=>s.points.push([month+"-01",successfulTrialOutcomes(toDate,s.type).length]));
    const date=parseDate(month+"-01");date.setUTCMonth(date.getUTCMonth()+1);month=date.toISOString().slice(0,7);
  }
  return series;
}

function countedMathResults(applyFilter = true) {
  return (state.data.math_news?.records || []).filter((item) => item.date.slice(0, 7) <= state.month && (!applyFilter || state.mathFilter === "all" || item.category === state.mathFilter));
}

function drawCumulative(id, dates, label) {
  const container = $(id);
  if (!dates.length) { container.innerHTML = '<div class="empty-state">No qualifying entries in this catalogue by the selected month.</div>'; return; }
  const increments = new Map();
  dates.forEach((date) => { const month = date.slice(0, 7); increments.set(month, (increments.get(month) || 0) + 1); });
  const firstMonth = [...increments.keys()].sort()[0];
  let month = previousMonth(firstMonth), cumulative = 0;
  const points = [];
  while (month <= state.month) {
    cumulative += increments.get(month) || 0;
    points.push([month, cumulative]);
    const date = parseDate(month + "-01"); date.setUTCMonth(date.getUTCMonth() + 1); month = date.toISOString().slice(0, 7);
  }
  const w = Math.max(260, container.clientWidth), h = 210, m = { top: 20, right: 22, bottom: 29, left: 32 };
  const max = Math.max(1, Math.ceil(cumulative / 4) * 4), step = Math.max(1, Math.ceil(max / 4));
  const x = (i) => m.left + i / Math.max(1, points.length - 1) * (w - m.left - m.right);
  const y = (value) => h - m.bottom - value / max * (h - m.top - m.bottom);
  let grid = "", path = `M${x(0)},${y(0)}`;
  for (let value = 0; value <= max; value += step) grid += `<line class="chart-grid" x1="${m.left}" x2="${w - m.right}" y1="${y(value)}" y2="${y(value)}"/><text x="${m.left - 8}" y="${y(value) + 4}" text-anchor="end">${value}</text>`;
  points.forEach((point, i) => { if (i) path += ` H${x(i)} V${y(point[1])}`; });
  const tickIndices = [...new Set(Array.from({ length: 4 }, (_, i) => Math.round(i * (points.length - 1) / 3)))];
  tickIndices.forEach((index) => { const point = points[index]; const label = points.length > 30 ? point[0].slice(0, 4) : formatDate(point[0] + "-01", { month: "short", year: "2-digit" }); grid += `<text x="${x(index)}" y="${h - 5}" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}">${label}</text>`; });
  container.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(label)}: ${cumulative} by ${escapeHTML(monthName(state.month))}">${grid}<path class="chart-line" d="${path}"/><circle cx="${x(points.length - 1)}" cy="${y(cumulative)}" r="3.2" fill="#315b72"/>${points.map((point, i) => `<circle cx="${x(i)}" cy="${y(point[1])}" r="7" fill="transparent"><title>${monthName(point[0])}: ${point[1]}</title></circle>`).join("")}</svg>`;
}

function drawOverview() {
  const us = countryMetric("US"), health = healthData().filter((row) => row.specialty === null);
  const lastHealth = health.at(-1), trials = countedTrials(false), mathResults = countedMathResults(false);
  const programs = new Set(trials.map((trial) => trial.program_id));
  const trialAvailable = state.data.trials?.available;
  $("overview-period").textContent = "Through " + monthName(state.month);
  $("overview-jobs").textContent = us.latest ? number(us.latest[1], 2) + "%" : "—";
  $("overview-jobs-detail").textContent = us.latest ? "As of " + formatDate(us.latest[0]) : "No observations";
  $("overview-devices").textContent = health.length ? number(health.reduce((sum, row) => sum + row.value, 0)) : "—";
  $("overview-devices-detail").textContent = lastHealth ? "Listed through " + monthName(lastHealth.date.slice(0, 7)) : "No observations";
  $("overview-trials").textContent = trialAvailable ? number(programs.size) : "—";
  $("overview-trials-detail").textContent = trialAvailable ? `${trials.length} trials · all AI-use categories` : "Registry data unavailable";
  $("overview-theorems").textContent = number(mathResults.length);
  $("overview-theorems-detail").textContent = "News coverage · claims and advances";
  const currentHealth = health.filter((row) => row.date.startsWith(state.month));
  const changes = [
    ["U.S. AI job-posting share", us.change === null ? "Unavailable" : signed(us.change) + " pp"],
    ["FDA-listed authorizations", currentHealth.length ? number(currentHealth.reduce((sum, row) => sum + row.value, 0)) : "Unavailable"],
    ["New trials with documented AI use", trialAvailable ? number(trials.filter((trial) => trialIncludedDate(trial).startsWith(state.month)).length) : "Unavailable"],
    ["New math breakthrough reports", number(mathResults.filter((proof) => proof.date.startsWith(state.month)).length)],
  ];
  $("monthly-changes").innerHTML = changes.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  $("coverage-list").innerHTML = [
    ["Jobs", `${Object.keys(state.data.jobs).length} countries · AI share & macro context`],
    ["Supply chain", `${Object.values(state.data.supply_chain || {}).filter(s=>["infrastructure","adoption","operations","euv"].includes(s.group) || s.company==="TSMC").length} indicators · EUV, infrastructure & adoption`],
    ["Medical devices", "United States · FDA list"],
    ["Drug trials", `${state.data.trials?.programs.length || 0} reviewed programs · registry records`],
    ["Math breakthroughs", "Major new results · news coverage"],
  ].map(([label, value]) => `<div><span>${label}</span><span>${value}</span></div>`).join("");
}

function drawTrials() {
  const data=state.data.trials,trials=countedTrials(),outcomes=countedTrialOutcomes(trials),results=state.trialChart==="outcomes";
  const programIds=new Set(trials.map(trial=>trial.program_id));
  $("trial-program-count").textContent=data?.available?number(programIds.size):"—";
  $("trial-count").textContent=data?.available?number(trials.length):"—";
  $("trial-efficacy-count").textContent=data?.available?number(successfulTrialOutcomes(outcomes,"efficacy").length):"—";
  $("trial-safety-count").textContent=data?.available?number(successfulTrialOutcomes(outcomes,"safety").length):"—";
  $("trial-category").value=state.trialCategory;
  document.querySelectorAll("[data-trial-chart]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.trialChart===state.trialChart)));
  $("trial-program-view").hidden=results;$("trial-outcome-view").hidden=!results;$("trial-chart-legend").hidden=!results;
  const newlyIncluded=trials.filter(trial=>trialIncludedDate(trial).startsWith(state.month)).length;
  $("trial-coverage").textContent=data?.available?`${data.programs.length} programs in the full catalogue · ${newlyIncluded} newly included trial${newlyIncluded===1?"":"s"} this month in this selection. Registry refreshed ${formatDate(data.fetched_at)}. Results reviewed ${displayDate(data.outcomes_reviewed_at)}.`:"Registry data is unavailable. Counts will appear after a successful refresh.";
  const categoryNotes={
    all:"Select an AI role to compare categories. A trial can appear in more than one role, so category counts are not additive.",
    molecular_design:"AI contributed to molecular design or optimization. Trial results assess the molecule, not the benefit of the design method.",
    target_selection:"AI helped identify the biological target. Molecular design is a separate role, and a program may qualify for both.",
    repurposing:"AI helped identify a new use for an existing drug. Only the verified indication and named trials are included.",
    recruitment:"No specific therapeutic drug trial has been verified for this category in the current catalogue. This does not mean AI recruitment is absent from the industry.",
    trial_analysis:"Included cases use secondary or supplemental AI analysis. They enter the series when that analysis was first reported; their original primary results used conventional assessments."
  };
  $("trial-category-note").textContent=categoryNotes[state.trialCategory];
  $("trial-chart-title").textContent=results?"Positive trial readouts over time":"Cumulative trials with AI use";
  $("trial-chart-note").textContent=results?"One trial per result type. Dated by the cited result report, or by a later AI-analysis disclosure. Safety readouts are separate from efficacy; counts do not measure AI’s causal benefit.":"Actual starts, or the relevant drug-comparison start for platform trials. Later AI analyses enter at their first report date. Historical counts use the latest reviewed evidence.";
  if(!data?.available) {
    ["trials-chart","trial-programs","trial-outcomes"].forEach(id=>$(id).innerHTML='<div class="empty-state">No registry snapshot available.</div>');
    $("trial-outcome-coverage").textContent="";return;
  }
  if(results) {
    const successSeries=trialSuccessSeries(outcomes);
    const maximum=Math.max(1,...successSeries.flatMap(s=>s.points.map(p=>p[1])));
    drawSeriesChart("trials-chart",successSeries,{unit:"count",domain:[0,Math.ceil(maximum/4)*4],label:"Reported primary efficacy successes and positive safety readouts over time"});
  } else drawCumulative("trials-chart",trials.map(trialIncludedDate),"Cumulative trials with documented AI use");
  const programs=data.programs.filter(program=>state.trialCategory==="all" || (program.ai_categories || ["molecular_design"]).includes(state.trialCategory) || data.trials.some(trial=>trial.program_id===program.id && trialMatchesCategory(trial)));
  const tags=categories=>categories.map(category=>`<span class="record-tag">${escapeHTML(trialCategoryNames[category])}</span>`).join("");
  $("trial-programs").innerHTML=programs.map(program=>{
    const records=data.trials.filter(trial=>trial.program_id===program.id && trialMatchesCategory(trial)).sort((a,b)=>(a.start_date || "9999").localeCompare(b.start_date || "9999"));
    const included=trials.filter(trial=>trial.program_id===program.id);
    return `<details class="program-record"><summary><span><strong>${escapeHTML(program.name)}</strong><span class="summary-sub">${escapeHTML(program.sponsor)}</span></span><span>${escapeHTML(program.indication)}<span class="trial-tags">${tags(program.ai_categories || ["molecular_design"])}</span></span><span>${included.length} included trial${included.length===1?"":"s"}<span class="summary-sub">${records.length} registry record${records.length===1?"":"s"}</span></span></summary><div class="detail-body"><p><strong>AI’s role:</strong> ${escapeHTML(program.ai_role)}</p><p class="data-note">${program.trial_scope==="explicit"?"Coverage is limited to these individually verified trials.":"Coverage follows verified molecular aliases in the registry."} ${escapeHTML(program.timing_note || "Attribution documents AI involvement; it does not establish how necessary AI was to the result.")}</p><div class="source-links">${externalLink(program.evidence_url,program.evidence_type)}${program.alias_url?externalLink(program.alias_url,"Program aliases"):""}</div><div class="table-wrap"><table><thead><tr><th scope="col">Trial</th><th scope="col">Phase</th><th scope="col">Start / inclusion date</th><th scope="col">Latest registry status</th><th scope="col">Reviewed result</th></tr></thead><tbody>${records.map(trial=>{
      const counted=included.some(item=>item.id===trial.id),readouts=outcomes.filter(item=>item.trial_id===trial.id);
      const start=displayDate(trial.start_date)+(trial.start_type==="ESTIMATED"?" (estimated)":"");
      return `<tr><td>${externalLink(trial.url,trial.id)}<span class="summary-sub">${counted?"Included in count":"Not counted by selected month"}</span>${trial.scope_note?`<span class="summary-sub trial-scope">${escapeHTML(trial.scope_note)}</span>`:""}</td><td>${escapeHTML(phaseName(trial.phases))}</td><td>${trial.comparison_start_date?"Platform: ":""}${escapeHTML(start)}${trialIncludedDate(trial)!==trial.start_date?`<span class="summary-sub">Included: ${escapeHTML(displayDate(trialIncludedDate(trial)))}</span>`:""}</td><td>${trial.comparison_start_date?"Platform: ":""}${escapeHTML(statusName(trial.status))}<span class="summary-sub">Updated ${escapeHTML(displayDate(trial.status_updated))}</span>${trial.why_stopped?`<span class="summary-sub">${escapeHTML(trial.why_stopped)}</span>`:""}</td><td>${readouts.length?readouts.map(item=>`${escapeHTML(item.label)}<span class="summary-sub">${externalLink(item.sources[0].url,displayDate(item.date))}</span>`).join(""):'<span class="meta">No reviewed result by this month</span>'}</td></tr>`;
    }).join("")}</tbody></table></div></div></details>`;
  }).join("") || '<div class="empty-state">No verified programs in this category yet.</div>';
  const reviewedIds=new Set(outcomes.map(item=>item.trial_id));
  $("trial-outcome-coverage").textContent=`${reviewedIds.size} of ${trials.length} included trials have a reviewed result · no industry success rate implied`;
  $("trial-outcomes").innerHTML=outcomes.length?outcomes.sort((a,b)=>b.date.localeCompare(a.date)).map(item=>{
    const program=data.programs.find(p=>p.id===item.program_id),trial=trials.find(t=>t.id===item.trial_id);
    const resultType={primary_efficacy_met:"Efficacy endpoint met",primary_safety_met:"Positive safety readout",mixed:"Mixed results",not_met:"Primary endpoint not met",discontinued:"Discontinued"}[item.outcome];
    return `<details class="trial-result"><summary><span><strong>${escapeHTML(program?.name || item.program_id)}</strong><span class="summary-sub">${escapeHTML(item.trial_id)} · Phase ${escapeHTML(phaseName(trial.phases))}</span></span><span class="record-tag">${escapeHTML(resultType)}</span><time datetime="${escapeHTML(item.date)}">${displayDate(item.date)}</time></summary><div class="detail-body"><h3>${escapeHTML(item.label)}</h3><p>${escapeHTML(item.summary)}</p><p><strong>Endpoint:</strong> ${escapeHTML(item.endpoint)}</p>${item.attribution_note?`<p>${escapeHTML(item.attribution_note)}</p>`:""}${item.count_date!==item.date?`<p class="data-note">AI involvement was reported ${displayDate(item.count_date)}, after this result. It enters the AI result series on that later date.</p>`:""}<p class="data-note">${escapeHTML(item.evidence_level)} · ${escapeHTML(item.date_basis)}</p><div class="source-links">${item.sources.map(source=>externalLink(source.url,source.title)).join("")}</div></div></details>`;
  }).join(""):'<div class="empty-state">No reviewed results for this category by the selected month. Unreviewed results are not classified as failures.</div>';
}

function drawMathematics() {
  const results = countedMathResults().sort((a, b) => b.date.localeCompare(a.date));
  $("math-count").textContent = number(results.length);
  $("math-resolution-count").textContent = number(results.filter((item) => item.category === "resolution").length);
  $("math-advance-count").textContent = number(results.filter((item) => item.category === "advance").length);
  $("math-coverage").textContent = "Curated reports, including claims under review; coverage is not exhaustive. Formalizations count only when they verify a new result. Reviewed " + formatDate(state.data.math_news.reviewed_at) + ".";
  drawCumulative("math-chart", results.map((item) => item.date), "Cumulative reported mathematical breakthroughs");
  $("math-records").innerHTML = results.length ? results.map((item) => `<article class="math-result"><div class="math-result-meta"><span class="record-tag">${escapeHTML(item.status)}</span><time datetime="${escapeHTML(item.date)}">${formatDate(item.date)}</time></div><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.summary)}</p><div class="news-links">${item.news_sources.map((source) => externalLink(source.url, source.name)).join("")}</div><details><summary>AI’s role &amp; evidence</summary><div class="detail-body"><p><strong>${escapeHTML(item.system)}:</strong> ${escapeHTML(item.ai_role)}</p><p>${escapeHTML(item.caveat)}</p><div class="source-links">${item.primary_sources.map((source) => externalLink(source.url, source.name)).join("")}</div></div></details></article>`).join("") : '<div class="empty-state">No covered breakthroughs match this month and result type.</div>';
}

function drawActivePanel() {
  if(typeof syncSupplyGlobe === "function") syncSupplyGlobe();
  if (state.active === "overview") drawOverview();
  if (state.active === "leading" && typeof drawLeading === "function") drawLeading();
  if (state.active === "sentiment" && typeof drawSentiment === "function") drawSentiment();
  if (state.active === "jobs") { drawJobs(); drawCountries(); }
  if (state.active === "supply-chain") drawSupply();
  if (state.active === "devices") drawHealth();
  if (state.active === "trials") drawTrials();
  if (state.active === "theorems") drawMathematics();
}

function switchTab(name, updateUrl = true) {
  const valid = Array.from(document.querySelectorAll('[role="tab"]')).some((tab) => tab.dataset.tab === name);
  if (!valid) name = "overview";
  state.active = name;
  document.querySelectorAll('[role="tab"]').forEach((tab) => { const selected = tab.dataset.tab === name; tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1; });
  document.querySelectorAll('[role="tabpanel"]').forEach((panel) => { panel.hidden = panel.id !== "panel-" + name; });
  if (updateUrl && location.hash !== "#" + name) history.pushState(null, "", "#" + name);
  drawActivePanel();
  if (updateUrl) window.scrollTo({ top: 0, behavior: "instant" });
}

function render() {
  $("month-select").value = state.month;
  const refreshed = formatDate(state.data.generated_at, { month: "long", day: "numeric", year: "numeric" });
  $("update-date").textContent = "Data prepared " + refreshed + " (UTC)";
  $("source-freshness").textContent = "Prepared " + refreshed + ". Current source versions; historical statuses are not reconstructed.";
  drawActivePanel();
}

async function init() {
  try {
    const response = await fetch("data/dashboard.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("Dashboard data unavailable");
    const data = await response.json();
    if (!data.reports || !data.jobs || !Array.isArray(data.health) || !data.trials || !data.math_news) throw new Error("Invalid dashboard data");
    state.data = data; state.month = data.default_month;
    if (!data.jobs[state.country]) state.country = Object.keys(data.jobs)[0] || "US";
    $("month-select").innerHTML = Object.keys(data.reports).sort().reverse().map((month) => `<option value="${escapeHTML(month)}">${monthName(month)}</option>`).join("");
    $("country-select").innerHTML = Object.entries(data.jobs).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([code, item]) => `<option value="${escapeHTML(code)}">${escapeHTML(item.name)}</option>`).join("");
    $("country-select").value = state.country; $("country-select").disabled = !Object.keys(data.jobs).length;
    $("month-select").addEventListener("change", (event) => { state.month = event.target.value; render(); });
    $("country-select").addEventListener("change", (event) => { state.country = event.target.value; drawJobs(); drawCountries(); });
    document.querySelectorAll("[data-job-view]").forEach(button=>button.addEventListener("click",()=>{state.jobView=button.dataset.jobView;document.querySelectorAll("[data-job-view]").forEach(other=>other.setAttribute("aria-pressed",String(other===button)));drawJobs();}));
    $("jobs-scale").addEventListener("change",event=>{state.jobScale=event.target.value;drawJobs();});
    $("trial-category").addEventListener("change",event=>{state.trialCategory=event.target.value;drawTrials();});
    document.querySelectorAll("[data-trial-chart]").forEach(button=>button.addEventListener("click",()=>{state.trialChart=button.dataset.trialChart;drawTrials();}));
    document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => { state.range = button.dataset.range; document.querySelectorAll("[data-range]").forEach((other) => other.setAttribute("aria-pressed", String(other === button))); drawJobs(); }));
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
      tab.addEventListener("keydown", (event) => {
        let target;
        if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") target = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") target = 0;
        if (event.key === "End") target = tabs.length - 1;
        if (target !== undefined) { event.preventDefault(); tabs[target].focus(); switchTab(tabs[target].dataset.tab); }
      });
    });
    document.querySelectorAll("[data-open-tab]").forEach((button) => button.addEventListener("click", () => { switchTab(button.dataset.openTab); $("tab-" + button.dataset.openTab).focus(); }));
    $("math-filter").addEventListener("change", (event) => { state.mathFilter = event.target.value; drawMathematics(); });
    document.querySelectorAll("[data-supply-view]").forEach(button=>button.addEventListener("click",()=>setSupplyView(button.dataset.supplyView)));
    if(typeof bindSentimentControls === "function") bindSentimentControls();
    if(typeof bindLeadingControls === "function") bindLeadingControls();
    if(typeof bindSupplyControls === "function") bindSupplyControls();
    const tabFromHash = () => { const name = location.hash.slice(1); if (name === "main-content") return; switchTab(({work:"jobs",health:"devices",research:"trials","math-breakthroughs":"theorems",supply:"supply-chain"})[name] || name || "overview", false); };
    window.addEventListener("hashchange", tabFromHash);
    tabFromHash(); render(); $("content").setAttribute("aria-busy", "false");
    let pending;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(drawActivePanel); });
    ["jobs-chart", "health-chart", "trials-chart", "math-chart", "supply-chart", "adoption-chart"].forEach((id) => observer.observe($(id)));
  } catch (error) {
    $("load-error").hidden = false; $("content").hidden = true;
    $("reload-button").addEventListener("click", () => location.reload());
  }
}

init();
