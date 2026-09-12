"""SQLite state: raw provenance, revisions, documents, and editorial decisions."""

import hashlib
import json
import math
import re
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False)


def digest(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def normalized_document(document):
    document = dict(document)
    for field in ("source", "external_id"):
        if not isinstance(document.get(field), str) or not document[field].strip():
            raise ValueError("Document requires a nonempty " + field)
        document[field] = document[field].strip()
    doi = document.get("doi") or ""
    if not isinstance(doi, str):
        raise ValueError("Document DOI must be text")
    doi = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", doi.strip(), flags=re.I)
    document["doi"] = doi.strip().lower() or None
    document.setdefault("metadata", {})
    if not isinstance(document["metadata"], dict):
        raise ValueError("Document metadata must be an object")
    return document


def document_aliases(document):
    aliases = ["registry:" + document["source"] + ":" + document["external_id"]]
    if document["doi"]:
        aliases.append("doi:" + document["doi"])
    return aliases


def document_hash(document):
    # Source metadata includes retraction/publication types and is review evidence.
    return digest({key: document.get(key) for key in
                   ("title", "abstract", "published_at", "doi", "url", "metadata")})


class Store:
    def __init__(self, root="data"):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(self.root / "aidash.sqlite3"))
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY, source TEXT NOT NULL, started_at TEXT NOT NULL,
            finished_at TEXT, status TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}');
          CREATE TABLE IF NOT EXISTS fetches (
            id INTEGER PRIMARY KEY, run_id INTEGER REFERENCES runs(id), url TEXT NOT NULL,
            sha256 TEXT NOT NULL, path TEXT NOT NULL, fetched_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS observations (
            id TEXT PRIMARY KEY, source TEXT NOT NULL, payload TEXT NOT NULL,
            active INTEGER NOT NULL, first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            run_id INTEGER REFERENCES runs(id));
          CREATE TABLE IF NOT EXISTS revisions (
            id INTEGER PRIMARY KEY, observation_id TEXT NOT NULL, run_id INTEGER REFERENCES runs(id),
            previous_payload TEXT, new_payload TEXT, changed_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY, source TEXT NOT NULL, content_hash TEXT NOT NULL,
            payload TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
            run_id INTEGER REFERENCES runs(id));
          CREATE TABLE IF NOT EXISTS document_aliases (
            alias TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id));
          CREATE TABLE IF NOT EXISTS extractions (
            document_id TEXT REFERENCES documents(id), content_hash TEXT NOT NULL,
            model TEXT NOT NULL, prompt_version TEXT NOT NULL, payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(document_id, content_hash, model, prompt_version));
          CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY, document_id TEXT REFERENCES documents(id),
            content_hash TEXT NOT NULL, decision TEXT NOT NULL, payload TEXT NOT NULL,
            reviewed_at TEXT NOT NULL);
        """)
        # Existing databases gain aliases without changing document/review IDs.
        # Legacy hashes invalidate old approvals once because metadata was omitted.
        try:
            with self.db:
                for row in self.db.execute("SELECT id,payload,content_hash FROM documents").fetchall():
                    document = normalized_document(json.loads(row["payload"]))
                    self._bind_aliases(row["id"], document_aliases(document))
                    content_hash = document_hash(document)
                    if content_hash != row["content_hash"]:
                        self.db.execute("UPDATE documents SET content_hash=? WHERE id=?", (content_hash, row["id"]))
        except Exception:
            self.db.close()
            raise

    def _bind_aliases(self, document_id, aliases):
        for alias in aliases:
            existing = self.db.execute("SELECT document_id FROM document_aliases WHERE alias=?", (alias,)).fetchone()
            if existing and existing[0] != document_id:
                raise ValueError("Document aliases refer to multiple existing documents; manual reconciliation required: " + alias)
            self.db.execute("INSERT OR IGNORE INTO document_aliases(alias,document_id) VALUES(?,?)", (alias, document_id))

    def start_run(self, source):
        with self.db:
            return self.db.execute("INSERT INTO runs(source,started_at,status) VALUES(?,?,'running')",
                                   (source, now())).lastrowid

    def finish_run(self, run_id, status, details):
        with self.db:
            self.db.execute("UPDATE runs SET finished_at=?,status=?,details=? WHERE id=?",
                            (now(), status, encoded(details), run_id))

    def record_fetch(self, run_id, url, sha256, path):
        with self.db:
            self.db.execute("INSERT INTO fetches(run_id,url,sha256,path,fetched_at) VALUES(?,?,?,?,?)",
                            (run_id, url, sha256, path, now()))

    def ingest_observations(self, source, observations, run_id):
        if not observations:
            raise ValueError("Empty source snapshot; preserving previous observations")
        incoming = {}
        for item in observations:
            if item["source"] != source or not isinstance(item["dimensions"], dict):
                raise ValueError("Observation source or dimensions do not match the schema")
            date.fromisoformat(item["period"])
            if isinstance(item["value"], bool) or not isinstance(item["value"], (int, float)) or not math.isfinite(item["value"]):
                raise ValueError("Observation values must be finite numbers")
            key = digest({k: item[k] for k in ("source", "metric", "geography", "period", "dimensions")})
            if key in incoming:
                raise ValueError("Duplicate observation key in source snapshot")
            incoming[key] = encoded(item)
        previous = {r["id"]: r for r in self.db.execute("SELECT * FROM observations WHERE source=?", (source,))}
        stats = {"added": 0, "revised": 0, "removed": 0, "unchanged": 0, "observations": len(incoming)}
        stamp = now()
        with self.db:
            for key, payload in incoming.items():
                old = previous.get(key)
                if old is None:
                    stats["added"] += 1
                elif old["payload"] != payload or not old["active"]:
                    stats["revised"] += 1
                    self.db.execute("INSERT INTO revisions(observation_id,run_id,previous_payload,new_payload,changed_at) VALUES(?,?,?,?,?)",
                                    (key, run_id, old["payload"] if old["active"] else None, payload, stamp))
                else:
                    stats["unchanged"] += 1
                self.db.execute("""INSERT INTO observations VALUES(?,?,?,1,?,?,?)
                    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,active=1,
                    updated_at=CASE WHEN observations.payload!=excluded.payload OR observations.active=0
                    THEN excluded.updated_at ELSE observations.updated_at END,run_id=excluded.run_id""",
                    (key, source, payload, stamp, stamp, run_id))
            for key, old in previous.items():
                if old["active"] and key not in incoming:
                    stats["removed"] += 1
                    self.db.execute("UPDATE observations SET active=0,updated_at=?,run_id=? WHERE id=?", (stamp, run_id, key))
                    self.db.execute("INSERT INTO revisions(observation_id,run_id,previous_payload,new_payload,changed_at) VALUES(?,?,?,NULL,?)",
                                    (key, run_id, old["payload"], stamp))
        return stats

    def ingest_documents(self, documents, run_id):
        stats = {"added": 0, "updated": 0, "unchanged": 0}
        with self.db:
            for document in documents:
                date.fromisoformat(document["published_at"])
                document = normalized_document(document)
                aliases = document_aliases(document)
                known = {row[0] for alias in aliases for row in
                         self.db.execute("SELECT document_id FROM document_aliases WHERE alias=?", (alias,))}
                if len(known) > 1:
                    raise ValueError("Document aliases refer to multiple existing documents; manual reconciliation required: " + ", ".join(aliases))
                default_key = "doi:" + document["doi"] if document["doi"] else document["source"] + ":" + document["external_id"]
                key = next(iter(known), default_key)
                content_hash = document_hash(document)
                old = self.db.execute("SELECT content_hash FROM documents WHERE id=?", (key,)).fetchone()
                stats["added" if old is None else "unchanged" if old[0] == content_hash else "updated"] += 1
                stamp = now()
                self.db.execute("""INSERT INTO documents VALUES(?,?,?,?,?,?,?)
                    ON CONFLICT(id) DO UPDATE SET content_hash=excluded.content_hash,payload=excluded.payload,
                    last_seen_at=excluded.last_seen_at,run_id=excluded.run_id""",
                    (key, document["source"], content_hash, encoded(document), stamp, stamp, run_id))
                self._bind_aliases(key, aliases)
        return stats

    def documents(self):
        return list(self.db.execute("SELECT * FROM documents ORDER BY json_extract(payload,'$.published_at') DESC,id"))

    def latest_review(self, document_id):
        return self.db.execute("SELECT * FROM reviews WHERE document_id=? ORDER BY id DESC LIMIT 1", (document_id,)).fetchone()

    def save_extraction(self, row, model, prompt_version, result):
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO extractions VALUES(?,?,?,?,?,?)",
                            (row["id"], row["content_hash"], model, prompt_version, encoded(result), now()))

    def review(self, document_id, decision, payload):
        row = self.db.execute("SELECT * FROM documents WHERE id=?", (document_id,)).fetchone()
        if row is None:
            raise ValueError("Unknown document ID")
        if decision not in ("publish", "reject"):
            raise ValueError("Decision must be publish or reject")
        if not payload.get("notes", "").strip():
            raise ValueError("A review note is required")
        if decision == "publish":
            for field in ("event_date", "summary", "discipline", "evidence_stage", "evidence_url"):
                if not payload.get(field):
                    raise ValueError("Publishing requires " + field)
            date.fromisoformat(payload["event_date"])
            if payload["evidence_stage"] not in ("reported", "experimentally_tested", "independently_validated", "deployed"):
                raise ValueError("Choose an explicit evidence stage")
            if not payload["evidence_url"].startswith("https://"):
                raise ValueError("Evidence must link to an HTTPS source")
        with self.db:
            self.db.execute("INSERT INTO reviews(document_id,content_hash,decision,payload,reviewed_at) VALUES(?,?,?,?,?)",
                            (document_id, row["content_hash"], decision, encoded(payload), now()))

    def public_milestones(self, month):
        entries = []
        for row in self.documents():
            review = self.latest_review(row["id"])
            if not review or review["decision"] != "publish" or review["content_hash"] != row["content_hash"]:
                continue
            details = json.loads(review["payload"])
            if not details["event_date"].startswith(month + "-"):
                continue
            document = json.loads(row["payload"])
            entries.append({"id": row["id"], "title": document["title"], "url": document["url"],
                            "published_at": document["published_at"], **details, "reviewed_at": review["reviewed_at"]})
        return sorted(entries, key=lambda x: (x["event_date"], x["id"]), reverse=True)
