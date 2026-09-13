"""Independent leading-indicator snapshots; failed downloads preserve prior data."""
import calendar
import csv
import io
import json
import math
from datetime import date
from pathlib import Path
from urllib.parse import urlencode

from ..store import now

CATALOGUE = Path(__file__).resolve().parents[1] / 'catalogue' / 'leading-indicators.json'
SOURCES = ['leading-economy', 'leading-btos', 'leading-canaries', 'leading-metr', 'leading-reviewed', 'leading-sentiment']
GROUPS = ['capability', 'adoption', 'jobs', 'investment', 'outcomes', 'science', 'sentiment']


def definition(key, name, group, unit, frequency, fred_id, note, kind='Leading signal'):
    return dict(id=key, name=name, group=group, unit=unit, frequency=frequency,
                geography='United States', source_name='BLS / FRED' if not fred_id.startswith('BA') else 'Census / FRED',
                url='https://fred.stlouisfed.org/series/'+fred_id, fred_id=fred_id,
                note=note, kind=kind, mode='Public feed', points=[])


ECONOMY = [
    definition('hires_total','Hiring rate · all industries','jobs','percent','monthly','JTSHIR','Monthly hires as a share of employment, seasonally adjusted. A hiring mechanism, not an estimate of AI displacement; release lags the reference month.'),
    definition('hires_professional','Hiring rate · professional & business services','jobs','percent','monthly','JTS540099HIR','Broad industry hiring rate, seasonally adjusted. Industry cycles and occupation mix also affect hiring.'),
    definition('layoffs_total','Layoff rate · all industries','jobs','percent','monthly','JTSLDR','Monthly layoffs and discharges as a share of employment, seasonally adjusted. Compare with hiring; excludes voluntary quits.'),
    definition('openings_total','Job-opening rate · all industries','jobs','percent','monthly','JTSJOR','Open positions as a share of employment plus openings, seasonally adjusted. Vacancies are intentions rather than completed hires.'),
    definition('business_applications','New business applications','outcomes','count','monthly','BABATOTALSAUS','Business applications, seasonally adjusted; applications need not become operating firms and are not identified as AI businesses.'),
    definition('high_propensity_applications','Applications likely to become employers','outcomes','count','monthly','BAHBATOTALSAUS','Census high-propensity classification, seasonally adjusted. Predictive characteristics do not establish that a business actually hired.'),
    definition('labor_productivity','Output per hour','outcomes','index','quarterly','OPHNFB','Nonfarm business labor productivity, index 2017=100, seasonally adjusted. Confirmation of aggregate output per hour; no causal attribution to AI.','Confirmation'),
    definition('real_compensation','Real hourly compensation','outcomes','index','quarterly','COMPRNFB','Nonfarm business inflation-adjusted hourly compensation, index 2017=100, seasonally adjusted. Compare growth with output per hour.','Confirmation'),
    definition('labor_share','Labor share of income','outcomes','index','quarterly','PRS85006173','Nonfarm business labor share INDEX, 2017=100, seasonally adjusted; not a percentage of national income. Many forces affect its level.','Confirmation'),
    definition('service_prices','Consumer service prices','outcomes','index','monthly','CUSR0000SASLE','CPI services excluding energy, index 1982–84=100, seasonally adjusted. Broad basket includes shelter; this is context, not the price of AI-delivered services.','Broad proxy'),
]


def parse_fred(raw, spec):
    reader=csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
    if reader.fieldnames != ['observation_date', spec['fred_id']]:
        raise ValueError('FRED columns changed for '+spec['id'])
    points=[]; seen=set()
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError('Malformed FRED row')
        day=date.fromisoformat(row['observation_date'])
        if day.day != 1 or day in seen or (spec['frequency']=='quarterly' and day.month not in (1,4,7,10)):
            raise ValueError('Unexpected or duplicate reference period')
        seen.add(day)
        if row[spec['fred_id']].strip() in ('','.'): continue
        value=float(row[spec['fred_id']])
        if not math.isfinite(value) or value<0: raise ValueError('Invalid FRED value')
        month=day.month+2 if spec['frequency']=='quarterly' else day.month
        end=date(day.year,month,calendar.monthrange(day.year,month)[1]).isoformat()
        points.append([end,value])
    if len(points)<8: raise ValueError('Insufficient FRED history')
    return {**spec,'unit_label': 'Index · 1982–84 = 100' if spec['id']=='service_prices' else 'Index · 2017 = 100' if spec['unit']=='index' else spec['unit'], 'points':sorted(points)}


def fetch_economy(fetch):
    rows=[]
    for spec in ECONOMY:
        url='https://fred.stlouisfed.org/graph/fredgraph.csv?'+urlencode({'id':spec['fred_id'],'cosd':'2019-01-01'})
        rows.append(parse_fred(fetch(url),spec))
    return rows


def validate_series(series, previous=None):
    seen=set()
    for item in series:
        if item['id'] in seen or item['group'] not in GROUPS: raise ValueError('Invalid or duplicate leading series')
        seen.add(item['id'])
        if not item['url'].startswith('https://') or not item.get('name') or not item.get('note'):
            raise ValueError('Leading series requires definition and HTTPS evidence')
        periods=set()
        for point in item['points']:
            if len(point)<2: raise ValueError('Invalid leading observation')
            day,value=point[:2];date.fromisoformat(day)
            if day in periods or (value is not None and (isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value))):
                raise ValueError('Invalid or duplicate leading observation')
            periods.add(day)
        if not periods: raise ValueError('Empty leading series')
        if item['points']!=sorted(item['points'],key=lambda p:p[0]): raise ValueError('Unsorted leading history')
    if not seen: raise ValueError('Empty leading snapshot')
    current={item['id']:{p[0] for p in item['points']} for item in series}
    by_id={item['id']:item for item in series}
    for item in previous or []:
        replacement=by_id.get(item['id'],{})
        if item['id'].startswith('metr_'):
            models=replacement.get('model_coverage',{})
            if not models or max(models.values())<max(p[0] for p in item['points']) or not set(item.get('model_coverage',{}))<=set(models):
                raise ValueError('METR model coverage lost; previous snapshot retained')
            continue
        if item['id'].startswith('canaries_'):
            points=replacement.get('points',[])
            if len(points)<min(len(item['points']),48) or not points or points[-1][0]<item['points'][-1][0] or replacement.get('published_at','')<item.get('published_at',''):
                raise ValueError('Stanford rolling vintage regressed or truncated')
            continue
        if not {p[0] for p in item['points']} <= current.get(item['id'],set()):
            raise ValueError('Leading snapshot lost history; previous snapshot retained')


def refresh_leading(store, fetch, source, run_id=None):
    if source=='leading-economy': series=fetch_economy(fetch)
    elif source in ('leading-reviewed','leading-sentiment'):
        source_catalogue=CATALOGUE if source=='leading-reviewed' else CATALOGUE.with_name('sentiment.json')
        body=source_catalogue.read_bytes()
        if run_id is not None:
            # Reuse archival format; the URL is a local reviewed-input identifier.
            import hashlib
            digest=hashlib.sha256(body).hexdigest();raw=store.root/'raw'/(digest+'.blob')
            raw.parent.mkdir(parents=True,exist_ok=True);raw.write_bytes(body)
            store.record_fetch(run_id,'catalog:'+source_catalogue.stem,digest,str(raw.relative_to(store.root)))
        series=json.loads(body)['series']
        if source=='leading-sentiment':
            from .sentiment import validate_surveys
            validate_surveys(series)
    else:
        from .leading_feeds import fetch_btos, fetch_canaries, fetch_metr
        series={'leading-btos':fetch_btos,'leading-canaries':fetch_canaries,'leading-metr':fetch_metr}[source](fetch)
    target=store.root/'leading'/f'{source}.json';target.parent.mkdir(parents=True,exist_ok=True)
    previous=json.loads(target.read_text())['series'] if target.exists() else []
    validate_series(series,previous)
    payload={'source':source,'fetched_at':now(),'series':series}
    temporary=target.with_suffix('.tmp');temporary.write_text(json.dumps(payload,ensure_ascii=False,allow_nan=False)+'\n')
    temporary.replace(target)
    return {'series':len(series),'observations':sum(len(s['points']) for s in series),
            'mode':'Reviewed catalogue import; new reports require review' if source in ('leading-reviewed','leading-sentiment') else 'Public source snapshot'}


def dashboard_leading(store, context=None):
    series={};runs=[]
    for source in SOURCES:
        path=store.root/'leading'/f'{source}.json'
        if path.exists():
            snapshot=json.loads(path.read_text())
            for item in snapshot['series']:
                if item['id'] in series: raise ValueError('Leading series ID collision')
                series[item['id']]={**item,'fetched_at':snapshot['fetched_at']}
        row=store.db.execute('SELECT source,status,finished_at FROM runs WHERE source=? ORDER BY id DESC LIMIT 1',(source,)).fetchone()
        runs.append(dict(row) if row else {'source':source,'status':'not_run','finished_at':None})
    for item in contextual_series(context or {}):
        if item['id'] in series: raise ValueError('Leading context ID collision')
        series[item['id']]=item
    catalogue=json.loads(CATALOGUE.read_text()) if CATALOGUE.exists() else {}
    for item in series.values():
        if item['id'].startswith('canaries_'): item['unit_label']='Index · Nov 2022 = 100'
        elif item['id'] in ('labor_productivity','real_compensation','labor_share'): item['unit_label']='Index · 2017 = 100'
        elif item['id']=='service_prices': item['unit_label']='Index · 1982–84 = 100'
    return {'series':series,'sources':runs,'gaps':catalogue.get('gaps',[]),'reviewed_at':catalogue.get('reviewed_at')}


def contextual_series(context):
    """Reuse stored activity feeds and curated trial evidence, never new claims of causality."""
    output=[]
    for key in ['us_electronics_orders','us_electronics_shipments','us_electronics_backlog','us_electronics_inventory','power','capex','equipment']:
        original=context.get('supply_chain',{}).get(key)
        if not original or not original.get('points'): continue
        item={**original,'id':'leading_'+key,'group':'investment','mode':'Existing activity feed',
              'source_name':original.get('source_name',original.get('source','CSO Ireland' if key=='power' else 'Public statistics')),
              'geography':original.get('geography_name',{'IE':'Ireland','US':'United States'}.get(original.get('geography'),original.get('geography'))),
              'kind':'Confirmation' if key=='power' else 'Broad proxy'}
        if key in ('capex','equipment'):
            item.update(source_name='Federal Reserve compilation',mode='Dated compilation',alert='Compilation dated July 2026; a newer report requires adapter review.')
        if key=='power': item['note']+=' Electricity consumption, not an interconnection queue or committed capacity.'
        output.append(item)
    trials=context.get('trials',{})
    if not trials.get('available'): return output
    eligible={t['id']:t for t in trials.get('trials',[]) if t.get('start_type')=='ACTUAL' and t.get('start_date')}
    phase_trials=[t for t in eligible.values() if set(t.get('phases',[]))&{'PHASE2','PHASE3'}]
    dates=sorted({max(t['start_date'],t.get('coverage_date') or t['start_date']) for t in phase_trials})
    common=dict(group='science',unit='count',frequency='event',display='step',geography='Reviewed trial catalogue',source_name='ClinicalTrials.gov + reviewed primary reports',url='https://clinicaltrials.gov/data-api/api',mode='Registry + reviewed evidence',kind='Confirmation',fetched_at=trials.get('fetched_at'),detail_tab='trials')
    if dates:
        output.append(dict(common,id='phase23_trials',name='Included phase 2 / 3 trials',points=[[day,sum(max(t['start_date'],t.get('coverage_date') or t['start_date'])<=day for t in phase_trials)] for day in dates],
                           note='Cumulative included trials, using actual starts or later AI-analysis disclosure dates. Phase is the latest registry classification, not a reconstructed history of phase transitions. Includes all reviewed AI roles; catalogue coverage is not exhaustive.'))
    events=[]
    for outcome in trials.get('outcomes',[]):
        trial=eligible.get(outcome['trial_id'])
        if trial and trial['program_id']==outcome['program_id'] and outcome.get('endpoint_type')=='efficacy':
            events.append({**outcome,'count_date':max(outcome['date'],trial['start_date'],trial.get('coverage_date') or trial['start_date'])})
    days=sorted({e['count_date'] for e in events});points=[]
    for day in days:
        latest={}
        for event in sorted(events,key=lambda e:e['date']):
            if event['count_date']<=day: latest[event['trial_id']]=event
        points.append([day,sum(e['outcome']=='primary_efficacy_met' for e in latest.values())])
    if points:
        output.append(dict(common,id='efficacy_trials',name='Trials with primary efficacy endpoints met',points=points,
                           note='One trial per latest reviewed primary efficacy result, dated by report or later AI disclosure. Later mixed or negative results replace earlier success. Safety-only readouts are excluded. These are selected drug outcomes, not proof of benefit caused by AI or an industry success rate.'))
    return output
