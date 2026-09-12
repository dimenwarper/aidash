"""Find math-breakthrough news for review; headlines never become proof counts.

RSS supplies discovery metadata only. Reviewed dashboard records link to both
news coverage and the underlying announcement or paper. No model judges the
truth of a mathematical claim from a headline.
"""
import json
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlencode
import xml.etree.ElementTree as ET

from ..store import digest, now

QUERIES = [
    '(AI OR "artificial intelligence" OR OpenAI OR Claude OR DeepMind) (mathematics OR conjecture) breakthrough',
    '(AI OR OpenAI OR Claude OR DeepMind) ("open problem" OR counterexample OR "new bound" OR "new proof")',
    '(AI OR OpenAI OR Claude) (sofic OR "group theory" OR "operator algebras" OR "sphere packing" OR "coding theory")',
    '(AI OR OpenAI OR Claude) ("Riemann hypothesis" OR "Navier-Stokes" OR Euler OR percolation OR Maxwell OR Freudenthal OR "Scott-Vogelius")',
    '(AlphaEvolve OR AlphaTensor OR FunSearch OR Aletheia OR "machine learning") (mathematics OR conjecture OR Ramsey OR "cap set" OR "matrix multiplication")',
]
CATALOGUE = Path(__file__).resolve().parents[1] / 'catalogue' / 'math_news.json'


def discover_math_news(fetch, start, end):
    start_day, end_day = date.fromisoformat(start), date.fromisoformat(end)
    if start_day > end_day:
        raise ValueError('Invalid news search date range')
    entries, urls, skipped = {}, [], 0
    for query in QUERIES:
        bounded = query + ' after:' + start + ' before:' + (end_day + timedelta(days=1)).isoformat()
        url = 'https://news.google.com/rss/search?' + urlencode({'q':bounded,'hl':'en-US','gl':'US','ceid':'US:en'})
        urls.append(url)
        root = ET.fromstring(fetch(url))
        channel = root.find('channel')
        if root.tag != 'rss' or channel is None:
            raise ValueError('News search did not return an RSS channel')
        for item in channel.findall('item'):
            title, link = (item.findtext('title') or '').strip(), (item.findtext('link') or '').strip()
            source = item.find('source')
            try:
                published = parsedate_to_datetime(item.findtext('pubDate') or '')
                if published.tzinfo is None:
                    published = published.replace(tzinfo=timezone.utc)
                published = published.astimezone(timezone.utc).date()
                if not title or not link.startswith('https://'):
                    raise ValueError('Missing news identity')
            except (TypeError, ValueError, OverflowError):
                skipped += 1
                continue
            if not start_day <= published <= end_day:
                continue
            key = digest({'url':link})
            entries[key] = {'id':key,'title':title,'url':link,'published_at':published.isoformat(),
                            'publisher':source.text if source is not None else None,'status':'unreviewed'}
    return {'searched_at':now(),'start':start,'end':end,'queries':urls,
            'entries':sorted(entries.values(),key=lambda row:(row['published_at'],row['id']),reverse=True),
            'skipped':skipped,'coverage':'Bounded news-search results; not an exhaustive survey.'}


def refresh_math_news(store, fetch, start, end):
    found = discover_math_news(fetch,start,end)
    path = store.root / 'math_news_candidates.json'
    previous = json.loads(path.read_text()) if path.exists() else {'entries':[]}
    entries = {item['id']:item for item in previous['entries']}
    added = sum(item['id'] not in entries for item in found['entries'])
    entries.update({item['id']:item for item in found['entries']})
    payload = {**found,'entries':sorted(entries.values(),key=lambda row:(row['published_at'],row['id']),reverse=True)}
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    temporary.replace(path)
    return {'found':len(found['entries']),'added':added,'skipped':found['skipped'],
            'publication':'Headlines saved for review; dashboard counts unchanged.'}


def load_math_results():
    payload = json.loads(CATALOGUE.read_text())
    seen = set()
    for item in payload['records']:
        if item['id'] in seen:
            raise ValueError('Duplicate mathematical result')
        seen.add(item['id'])
        date.fromisoformat(item['date'])
        if item['category'] not in ('resolution','advance'):
            raise ValueError('Only new resolutions and partial advances belong in the news count')
        if not item['news_sources'] or not item['primary_sources']:
            raise ValueError('A result requires news coverage and primary evidence')
        for source in item['news_sources'] + item['primary_sources']:
            if not source['url'].startswith('https://'):
                raise ValueError('Evidence must use HTTPS')
    return payload
