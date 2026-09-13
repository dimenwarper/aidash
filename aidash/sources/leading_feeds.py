"""Public Census, Stanford/ADP and METR feeds, with explicit methodology boundaries."""
import calendar
import csv
import io
import json
import math
import re
import zipfile
from datetime import date

from .leading import CATALOGUE


def definitions(prefix):
    return [s.copy() for s in json.loads(CATALOGUE.read_text())['feed_definitions'] if s['id'].startswith(prefix)]


def month_end(value):
    day=date.fromisoformat(value)
    return day.replace(day=calendar.monthrange(day.year,day.month)[1]).isoformat()


def finite(value, lo=0, hi=None):
    if isinstance(value,bool): raise ValueError('Boolean observation')
    value=float(value)
    if not math.isfinite(value) or value<lo or (hi is not None and value>hi):
        raise ValueError('Observation outside source bounds')
    return value


def parse_btos(raw, specs):
    rows=json.loads(raw)
    if not isinstance(rows,list) or not rows: raise ValueError('Empty Census feed')
    questions={'Current AI Use (Last Two Weeks)':'current','Expected AI Use (Next Six Months)':'expected'}
    for row in rows:
        if row['xmltag'] not in questions: raise ValueError('Census question wording changed')
        if date.fromisoformat(row['Date']) < date(2025,11,30): raise ValueError('Census methodology boundary changed')
    output=[]
    for spec in specs:
        facet_key={'sector':'NAICS','size':'EMPSIZE'}.get(spec['scope'])
        selected=[r for r in rows if questions[r['xmltag']]==spec['status'] and (not facet_key or r[facet_key]==spec['facet'])]
        if not selected: raise ValueError('Census facet missing: '+spec['id'])
        points=sorted([[r['Date'],None if r['Estimate'] is None else finite(r['Estimate'],0,100)] for r in selected])
        output.append({**spec,'points':points})
    return output


def fetch_btos(fetch):
    specs=definitions('btos');output=[]
    for url in dict.fromkeys(s['data_url'] for s in specs):
        output.extend(parse_btos(fetch(url),[s for s in specs if s['data_url']==url]))
    return output


def parse_canaries(raw, specs):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        member=archive.getinfo('canaries_age_by_exposure.csv')
        if member.file_size>20*1024*1024: raise ValueError('Stanford expanded file too large')
        csv_text=archive.read(member).decode('utf-8-sig')
    reader=csv.DictReader(io.StringIO(csv_text))
    required={'observation_date','exposure_quintile','vintage',*(s['age_column'] for s in specs)}
    if not required<=set(reader.fieldnames or []): raise ValueError('Stanford CSV schema changed')
    rows=list(reader);output=[]
    for spec in specs:
        selected=[r for r in rows if re.fullmatch(r'Quintile '+str(spec['exposure_quintile'])+r'( \((least|most) exposed\))?',r['exposure_quintile'])]
        points=sorted([[month_end(r['observation_date']),finite(r[spec['age_column']])] for r in selected if r[spec['age_column']] not in ('','.','NA')])
        if len(points)<48: raise ValueError('Stanford rolling coverage truncated')
        anchor=dict(points).get('2022-11-30')
        if anchor is not None and abs(anchor-100)>1e-5: raise ValueError('Stanford index base changed')
        vintages=[date.fromisoformat(r['vintage']).isoformat() for r in selected]
        output.append({**spec,'points':points,'published_at':max(vintages)})
    return output


def fetch_canaries(fetch):
    specs=definitions('canaries')
    return parse_canaries(fetch(specs[0]['data_url']),specs)


def parse_metr_yaml(text):
    """Fail-closed restricted parser for the feed's result mapping, not general YAML."""
    results={};inside=False;item=None;metric=None
    for line in text.splitlines():
        if line=='results:': inside=True;continue
        if not inside: continue
        if line and not line.startswith((' ','#')): break
        hit=re.fullmatch(r'  ([A-Za-z0-9_.-]+):',line)
        if hit:
            if hit[1] in results: raise ValueError('Duplicate METR model')
            item={'model_id':hit[1],'metrics':{}};results[hit[1]]=item;metric=None;continue
        if item is None: continue
        hit=re.fullmatch(r'    (benchmark_name|release_date): ([^#]+)',line)
        if hit: item[hit[1]]=hit[2].strip().strip('\"\'');continue
        hit=re.fullmatch(r'      (p50_horizon_length|p80_horizon_length):',line)
        if hit: metric=hit[1];item['metrics'][metric]={};continue
        hit=re.fullmatch(r'        (estimate|ci_low|ci_high): ([^#]+)',line)
        if hit and metric:
            if hit[2].strip() in ('.nan','null','None'): value=None
            else: value=finite(hit[2])
            item['metrics'][metric][hit[1]]=value
        elif line.startswith('      ') and not line.startswith('        '): metric=None
    for item in results.values():
        date.fromisoformat(item['release_date'])
        for metric in ('p50_horizon_length','p80_horizon_length'):
            v=item['metrics'][metric]
            if v.get('estimate') is None or v['estimate']<=0: raise ValueError('Invalid METR horizon')
            if v.get('ci_low') is not None and v['ci_low']>v['estimate']: raise ValueError('Invalid METR lower bound')
            if v.get('ci_high') is not None and v['ci_high']<v['estimate']: raise ValueError('Invalid METR upper bound')
    if not results: raise ValueError('Empty METR results')
    return list(results.values())


def metr_frontiers(raw, specs):
    models=parse_metr_yaml(raw.decode('utf-8'));output=[]
    for spec in specs:
        metric='p50_horizon_length' if 'p50' in spec['id'] else 'p80_horizon_length'
        rows=sorted((m for m in models if m['benchmark_name']=='METR-Horizon-v1.1'),key=lambda m:(m['release_date'],-m['metrics'][metric]['estimate']))
        selected=[];best=-1
        for row in rows:
            if row['metrics'][metric]['estimate']>best: selected.append(row);best=row['metrics'][metric]['estimate']
        if len(selected)<3: raise ValueError('Insufficient METR v1.1 results')
        output.append({**spec,'model_coverage':{m['model_id']:m['release_date'] for m in rows},'points':[[m['release_date'],m['metrics'][metric]['estimate']] for m in selected],
                       'point_details':[dict(date=m['release_date'],model=m['model_id'],**m['metrics'][metric]) for m in selected]})
    return output


def fetch_metr(fetch):
    specs=definitions('metr')
    return metr_frontiers(fetch(specs[0]['data_url']),specs)
