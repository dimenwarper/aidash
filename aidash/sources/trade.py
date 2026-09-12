"""Public UN Comtrade preview: strict bounded annual trade asset parser."""
import json
import math
from pathlib import Path
from urllib.parse import urlencode

REPORTERS = [156,410,392,842,528,490,702,458,484,704,276,372]
BASE_CODES = ['848620','8542','847150']
COUNTRIES = {
 156: ('CHN','China',35.9,104.2),
 410: ('KOR','Rep. of Korea',36.3,127.8),
 392: ('JPN','Japan',36.2,138.3),
 842: ('USA','United States',39.8,-98.6),
 528: ('NLD','Netherlands',52.1,5.3),
 490: ('OAS','Other Asia, nes',23.7,121.0),
 702: ('SGP','Singapore',1.35,103.82),
 458: ('MYS','Malaysia',4.2,101.9),
 484: ('MEX','Mexico',23.6,-102.6),
 704: ('VNM','Viet Nam',16.2,107.8),
 276: ('DEU','Germany',51.2,10.4),
 372: ('IRL','Ireland',53.1,-7.7),
}
COMMODITIES = {
 '8542': dict(id='8542',name='Integrated circuits',hs_code='8542',description='Electronic integrated circuits',scope='All integrated circuits, including non-AI applications; this is not an accelerator or HBM shipment count.'),
 '847150': dict(id='847150',name='Computer processing units',hs_code='847150',description='Processing units other than HS 8471.41 or 8471.49, whether or not containing storage, input or output units in the same housing.',scope='A broad customs category including servers and other processing units; it does not identify AI servers, accelerators, or all server configurations.'),
 '848620': dict(id='848620',name='Chipmaking machinery',hs_code='848620',description='Machines and apparatus used solely or principally for manufacturing semiconductor devices or electronic integrated circuits.',scope='Includes many kinds of semiconductor-production equipment; EUV machines and components are not isolated by this code.'),
}
MATERIALS = json.loads((Path(__file__).resolve().parents[1] / 'catalogs' / 'material-commodities.json').read_text(encoding='utf-8'))['commodities']
COMMODITIES.update({item['hs_code']: item for item in MATERIALS})
MATERIAL_CODES = [item['hs_code'] for item in MATERIALS]
CODES = BASE_CODES + MATERIAL_CODES


def code_batches():
    # Twelve reporters × thirteen partners × three products stays below 500.
    return [BASE_CODES] + [MATERIAL_CODES[i:i+3] for i in range(0, len(MATERIAL_CODES), 3)]

def request_url(year, codes=BASE_CODES):
    if not codes or len(codes)>3 or len(set(codes))!=len(codes) or not set(codes)<=set(CODES):
        raise ValueError('Trade requests require one to three distinct known HS categories')
    params = dict(period=str(year),reporterCode=','.join(map(str,REPORTERS)),cmdCode=','.join(codes),flowCode='X',partnerCode='0,'+','.join(map(str,REPORTERS)),partner2Code='0',customsCode='C00',motCode='0',maxRecords='500',includeDesc='true')
    return 'https://comtradeapi.un.org/public/v1/preview/C/A/HS?'+urlencode(params,safe=',')

def parse_response(blob, year, codes=BASE_CODES):
    payload = json.loads(blob)
    if payload.get('error'):
        raise ValueError('UN Comtrade error: '+str(payload['error']))
    rows = payload.get('data')
    if not isinstance(rows,list) or not rows or payload.get('count') != len(rows):
        raise ValueError('Missing/empty data or count mismatch')
    if len(rows) >= 500:
        raise ValueError('Potential preview truncation: split reporter selections')
    if len(rows) > len(REPORTERS)*(len(REPORTERS)+1)*len(codes):
        raise ValueError('Unexpected row count for bounded selection')
    seen=set()
    for row in rows:
        key=(row.get('reporterCode'),row.get('partnerCode'),row.get('cmdCode'))
        if key in seen:
            raise ValueError('Duplicate route/product/period')
        seen.add(key)
        if (row.get('typeCode')!='C' or row.get('freqCode')!='A' or
            row.get('period')!=str(year) or row.get('refYear')!=year or
            row.get('reporterCode') not in REPORTERS or
            row.get('partnerCode') not in [0]+REPORTERS or
            row.get('cmdCode') not in codes or row.get('flowCode')!='X' or
            row.get('partner2Code')!=0 or row.get('customsCode')!='C00' or
            row.get('motCode')!=0 or str(row.get('mosCode'))!='0'):
            raise ValueError('Response dimension does not match request')
        if row.get('classificationSearchCode')!='HS' or row.get('classificationCode') not in {'H4','H5','H6'} or row.get('isOriginalClassification') is not True:
            raise ValueError('Unexpected HS vintage or converted classification')
        value=row.get('primaryValue')
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0 or value!=row.get('fobvalue'):
            raise ValueError('Invalid export FOB value')
        if not row.get('reporterDesc') or not row.get('partnerDesc') or not row.get('cmdDesc'):
            raise ValueError('Expected includeDesc=true metadata')
    return rows


def trade_observations(blob, year, codes=BASE_CODES):
    from .context import observation
    rows = parse_response(blob, year, codes)
    world = {(r['reporterCode'], r['cmdCode']) for r in rows if r['partnerCode'] == 0}
    coverage = {}
    for code in codes:
        missing = sorted(reporter for reporter in REPORTERS if (reporter, code) not in world)
        coverage[code] = dict(year=str(year), commodity=code, reporter_count=len(REPORTERS)-len(missing), expected=len(REPORTERS), missing=[COUNTRIES[r][1] for r in missing])
    result = []
    for record in rows:
        origin, dest, code = record['reporterCode'], record['partnerCode'], record['cmdCode']
        if dest == 0 or origin == dest:
            continue
        metric = 'trade-' + '-'.join(map(str, (code, origin, dest)))
        commodity = COMMODITIES[code]
        meta = dict(name=COUNTRIES[origin][1] + ' → ' + COUNTRIES[dest][1], stage=commodity['name'], group='trade', geography=COUNTRIES[origin][1], geography_name=COUNTRIES[origin][1], frequency='annual', unit='usd', unit_label='Nominal exports · USD · FOB', measure='Trade', commodity=code, origin=str(origin), destination=str(dest), from_coordinates=[COUNTRIES[origin][3], COUNTRIES[origin][2]], to_coordinates=[COUNTRIES[dest][3], COUNTRIES[dest][2]], url='https://uncomtrade.org/docs/un-comtrade-api/', source_name='UN Comtrade', refresh_mode='Official feed', note=commodity['scope'] + ' Gross exports reported by the origin; no mirror imports added. Selected bilateral routes, not a complete supplier network. Original HS edition retained; missing years remain blank.')
        row = observation('activity-trade', metric, meta, str(year) + '-12-31', record['primaryValue'], request_url(year, codes))
        row['metadata'] = meta
        row['evidence'] = dict(url=request_url(year, codes), classification=record['classificationCode'], coverage=coverage[code])
        result.append(row)
    return result


def fetch_trade(fetch):
    from datetime import date
    rows = []
    for year in range(2019, date.today().year):
        for codes in code_batches():
            rows.extend(trade_observations(fetch(request_url(year, codes)), year, codes))
    return rows
