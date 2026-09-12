"""Discover unreviewed AI protein/drug research candidates in Europe PMC.

The pilot requires AI terms, protein/drug discovery terms and experimental or
clinical validation terms in titles/abstracts, excluding indexed reviews. These
mentions are screening signals, not proof that a work used AI or was validated.
It misses papers with different wording and does not cover all life sciences or
scientific disciplines. Hits are unreviewed candidates, never breakthroughs.
The caller owns network access, snapshot archiving and review.

API: https://europepmc.org/RestfulWebService
Fields: https://europepmc.org/docs/EBI_Europe_PMC_Web_Service_Reference.pdf
Europe PMC may normalize incomplete publication dates. We preserve its ISO day
without claiming that the original publication supplied day-level precision.
"""

import datetime as dt
from html.parser import HTMLParser
import json
import re
from typing import Callable, Optional
from urllib.parse import quote, urlencode


SEARCH_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
SCOPE = "protein_and_drug_discovery"
SEARCH_QUERY = (
    '(TITLE_ABS:"artificial intelligence" OR TITLE_ABS:"machine learning" '
    'OR TITLE_ABS:"deep learning" OR TITLE_ABS:"generative AI" '
    'OR TITLE_ABS:AlphaFold) AND '
    '(TITLE_ABS:"drug discovery" OR TITLE_ABS:"protein design" '
    'OR TITLE_ABS:"de novo protein" OR TITLE_ABS:"antibiotic discovery" '
    'OR TITLE_ABS:"drug repurposing") AND '
    '(TITLE_ABS:"experimental validation" OR TITLE_ABS:"experimentally validated" '
    'OR TITLE_ABS:"in vitro" OR TITLE_ABS:"in vivo" OR TITLE_ABS:preclinical '
    'OR TITLE_ABS:"clinical trial") NOT PUB_TYPE:review'
)


class _PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1
        elif tag in {"p", "div", "br", "h1", "h2", "h3", "li"}:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)
        elif tag in {"p", "div", "h1", "h2", "h3", "li"}:
            self.parts.append(" ")

    def handle_data(self, value):
        if not self.hidden:
            self.parts.append(value)


def _plain(value) -> str:
    if not isinstance(value, str):
        return ""
    parser = _PlainText()
    parser.feed(value)
    parser.close()
    return " ".join("".join(parser.parts).split())


def _day(value: str) -> dt.date:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Expected a complete ISO date (YYYY-MM-DD)")
    return dt.date.fromisoformat(value)


def normalize_doi(value) -> Optional[str]:
    """Normalize common DOI forms; do not manufacture identifiers from bad data."""
    if not isinstance(value, str):
        return None
    value = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", value.strip(), flags=re.I)
    value = value.strip().lower()
    return value if re.fullmatch(r"10\.\d{4,9}/[^\s<>]+", value) else None


def _record_id(record: dict) -> Optional[str]:
    source, identifier = record.get("source"), record.get("id")
    if not isinstance(source, str) or not re.fullmatch(r"[A-Za-z0-9]+", source):
        return None
    if not isinstance(identifier, str) or not identifier.strip():
        return None
    return source.upper() + ":" + identifier.strip()


def _document(record: dict, identity: str, start: dt.date, end: dt.date) -> dict:
    published_at = record.get("firstPublicationDate")
    published = _day(published_at)
    if not start <= published <= end:
        raise ValueError("publication date outside requested window")
    title = _plain(record.get("title"))
    if not title:
        raise ValueError("missing title")
    doi = normalize_doi(record.get("doi"))
    source, identifier = identity.split(":", 1)
    journal_info = record.get("journalInfo") or {}
    journal = journal_info.get("journal") or {}
    pub_types = (record.get("pubTypeList") or {}).get("pubType", [])
    if isinstance(pub_types, str):
        pub_types = [pub_types]
    rights = {
        "is_open_access": {"Y": True, "N": False}.get(record.get("isOpenAccess")),
        "license": _plain(record.get("license")) or None,
        "copyright": _plain(record.get("copyright")) or None,
    }
    return {
        "source": "europepmc",
        "external_id": identity,
        "doi": doi,
        "title": title,
        "abstract": _plain(record.get("abstractText")),
        "published_at": published_at,
        "url": ("https://doi.org/" + quote(doi, safe="/") if doi else
                "https://europepmc.org/article/" + quote(source, safe="") + "/" + quote(identifier, safe="")),
        "metadata": {
            "scope": SCOPE,
            "review_status": "unreviewed",
            "publication_types": [_plain(value) for value in pub_types if _plain(value)],
            "authors": _plain(record.get("authorString")),
            "journal": _plain(journal.get("title")),
            "rights": rights,
            "date_source": "Europe PMC firstPublicationDate",
            "date_precision": "provider_normalized; original precision unknown",
        },
    }


def discover(fetch_bytes: Callable[[str], bytes], start: str, end: str,
             max_pages: int = 2, page_size: int = 100) -> dict:
    """Fetch a bounded, inclusive date-window search with explicit coverage status.

    ``complete`` means all reported search records were retrieved and valid; it
    never implies all scientific work was found. The defaults cap work at 200
    search records. Any cap, cursor loop, changing hit count or rejected record
    yields ``complete=False`` with a warning. Duplicate registry identities are
    retained once; DOI normalization also enables cross-source dedupe upstream.
    Fetch/JSON/schema errors raise instead of looking like a successful empty run.
    """
    start_day, end_day = _day(start), _day(end)
    if start_day > end_day:
        raise ValueError("start must be on or before end")
    if type(max_pages) is not int or max_pages < 1:
        raise ValueError("max_pages must be a positive integer")
    if type(page_size) is not int or not 1 <= page_size <= 1000:
        raise ValueError("page_size must be an integer between 1 and 1000")
    query = SEARCH_QUERY + " AND FIRST_PDATE:[" + start + " TO " + end + "]"
    cursor, seen_cursors, seen_ids = "*", set(), set()
    documents, warnings = [], []
    reported_total, first_total, pages_fetched, rejected = 0, None, 0, 0
    exhausted = False
    for _ in range(max_pages):
        seen_cursors.add(cursor)
        url = SEARCH_URL + "?" + urlencode({
            "query": query, "format": "json", "resultType": "core",
            "pageSize": page_size, "cursorMark": cursor,
        })
        payload = json.loads(fetch_bytes(url))
        if not isinstance(payload, dict):
            raise ValueError("Europe PMC response must be an object")
        hit_count = payload.get("hitCount")
        result_list = payload.get("resultList")
        if type(hit_count) is not int or hit_count < 0:
            raise ValueError("Europe PMC response has an invalid or missing hitCount")
        if not isinstance(result_list, dict) or not isinstance(result_list.get("result"), list):
            raise ValueError("Europe PMC response has an invalid or missing resultList.result")
        records = result_list["result"]
        pages_fetched += 1
        reported_total = max(reported_total, hit_count)
        if first_total is None:
            first_total = hit_count
        elif first_total != hit_count and "reported_total_changed" not in warnings:
            warnings.append("reported_total_changed")
        new_ids = 0
        for record in records:
            identity = _record_id(record) if isinstance(record, dict) else None
            if identity is None:
                rejected += 1
                warnings.append("skipped_record: missing source or id")
                continue
            if identity in seen_ids:
                continue
            seen_ids.add(identity)
            new_ids += 1
            try:
                documents.append(_document(record, identity, start_day, end_day))
            except (ValueError, TypeError, AttributeError) as exc:
                rejected += 1
                warnings.append("skipped_record " + identity + ": " + str(exc))
        if len(seen_ids) > reported_total:
            warnings.append("received_more_unique_records_than_reported_total")
        if len(seen_ids) >= reported_total:
            exhausted = True
            break
        next_cursor = payload.get("nextCursorMark")
        if not records:
            warnings.append("empty_page_before_reported_total")
            break
        if not isinstance(next_cursor, str) or not next_cursor:
            warnings.append("missing_next_cursor_before_reported_total")
            break
        if next_cursor in seen_cursors:
            warnings.append("cursor_loop_before_reported_total")
            break
        if new_ids == 0:
            warnings.append("repeated_page_before_reported_total")
            break
        cursor = next_cursor
    else:
        warnings.append("max_pages_reached")
    return {
        "documents": documents,
        "complete": exhausted and not warnings,
        "reported_total": reported_total,
        "query": query,
        "scope": SCOPE,
        "pages_fetched": pages_fetched,
        "rejected_records": rejected,
        "warnings": warnings,
    }
