"""Validate reviewed public opinion waves before importing their static snapshot."""
from datetime import date
import math


def validate_surveys(series):
    if not series: raise ValueError('Empty sentiment catalogue')
    for item in series:
        if item.get('group')!='sentiment' or item.get('unit')!='percent':
            raise ValueError('Sentiment waves require percentage units and sentiment group')
        if not item.get('question') or not item.get('population') or not item.get('survey_family'):
            raise ValueError('Survey question, population and source family are required')
        evidence=item.get('point_details',[])
        details={e['date']:e for e in evidence}
        if len(details)!=len(evidence): raise ValueError('Duplicate survey-wave evidence')
        for day,value in item['points']:
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not 0<=value<=100:
                raise ValueError('Invalid survey percentage')
            entry=details.get(day)
            if not entry or entry.get('value')!=value: raise ValueError('Each survey value requires matching evidence')
            start=date.fromisoformat(entry['fieldwork_start']);end=date.fromisoformat(entry['fieldwork_end'])
            published=date.fromisoformat(entry['published_at'])
            if start>end or end>published or day!=end.isoformat():
                raise ValueError('Survey observation must use fieldwork end, before publication')
            if not entry.get('url','').startswith('https://') or not entry.get('methodology'):
                raise ValueError('Survey waves require primary evidence and methodology')
            if not entry.get('population'):
                raise ValueError('Wave population must be documented')
        if set(details)!={p[0] for p in item['points']}: raise ValueError('Survey evidence and points differ')
