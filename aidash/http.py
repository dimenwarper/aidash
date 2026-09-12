"""Bounded public-source downloads with raw snapshots for reproducibility."""

import hashlib
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def fetch_bytes(url):
    if not url.startswith("https://"):
        raise ValueError("Source downloads must use HTTPS")
    # FRED's CSV endpoint times out for the custom research User-Agent, while
    # urllib's default is supported. Keep identical bounds and archival handling.
    headers = {} if url.startswith("https://fred.stlouisfed.org/") else {"User-Agent": "aidash-research/0.1 (public data ingestion)"}
    request = Request(url, headers=headers)
    for attempt in range(3):
        try:
            with urlopen(request, timeout=45) as response:
                body = response.read(20 * 1024 * 1024 + 1)
            if len(body) > 20 * 1024 * 1024:
                raise ValueError("Source response exceeded the 20 MB limit")
            if not body:
                raise ValueError("Source returned an empty response")
            return body
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise RuntimeError("Source request failed (HTTP %s)" % error.code) from error
        except (URLError, TimeoutError) as error:
            if attempt == 2:
                raise RuntimeError("Source request failed: network connection unavailable") from error
        time.sleep(2 ** attempt)


def archived_fetch(store, run_id, downloader=fetch_bytes):
    def fetch(url):
        body = downloader(url)
        digest = hashlib.sha256(body).hexdigest()
        path = store.root / "raw" / (digest + ".blob")
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            temporary = path.with_suffix(".tmp")
            temporary.write_bytes(body)
            temporary.replace(path)
        store.record_fetch(run_id, url, digest, str(path.relative_to(store.root)))
        return body
    return fetch
