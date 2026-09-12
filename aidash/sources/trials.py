"""Refresh registered drug trials with a reviewed, explicitly documented AI role.

Design attribution is curated separately from the registry. The registry does
not have a reliable AI-designed-drug flag. A snapshot is replaced only after all
queries and required IDs succeed; raw responses are archived by the caller.
"""

import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlencode

from ..store import digest, now

CATALOGUE = Path(__file__).resolve().parents[1] / "catalogue" / "drugs.json"
OUTCOMES = CATALOGUE.with_name("trial-outcomes.json")
API = "https://clinicaltrials.gov/api/v2/studies"
AI_CATEGORIES = {"molecular_design", "target_selection", "repurposing", "recruitment", "trial_analysis"}


def load_catalogue():
    return json.loads(CATALOGUE.read_text())


def load_outcomes():
    reviewed = json.loads(OUTCOMES.read_text())
    seen = set()
    for item in reviewed["outcomes"]:
        key = (item["trial_id"], item["date"], item["outcome"])
        if key in seen or not re.fullmatch(r"NCT\d{8}", item["trial_id"]):
            raise ValueError("Duplicate or invalid trial outcome")
        seen.add(key)
        checked_date(item["date"])
        if item["outcome"] not in {"primary_efficacy_met", "primary_safety_met", "mixed", "not_met", "discontinued"}:
            raise ValueError("Unknown reviewed trial outcome")
        if not item.get("sources") or any(not source["url"].startswith("https://") for source in item["sources"]):
            raise ValueError("Trial outcome requires source evidence")
    return reviewed


def normalized_name(value):
    return re.sub(r"[^a-z0-9]", "", value.lower())


def checked_date(value):
    if value is None:
        return None
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}(?:-\d{2})?", value):
        raise ValueError("Invalid registry date")
    date.fromisoformat(value if len(value) == 10 else value + "-01")
    return value


def normalize_study(study, program):
    protocol = study["protocolSection"]
    identity = protocol["identificationModule"]
    nct = identity["nctId"]
    if not re.fullmatch(r"NCT\d{8}", nct):
        raise ValueError("Invalid registry identifier")
    if program.get("trial_scope") == "explicit" and nct not in program["trial_ids"]:
        return None
    design = protocol["designModule"]
    if design["studyType"] != "INTERVENTIONAL":
        return None
    aliases = {normalized_name(name) for name in program["aliases"]}
    interventions = protocol["armsInterventionsModule"]["interventions"]
    matched = [item for item in interventions if item.get("type") in ("DRUG", "BIOLOGICAL") and any(
        normalized_name(name) in aliases for name in [item.get("name", "")] + item.get("otherNames", []))]
    if not matched:
        return None
    status = protocol["statusModule"]
    start = status.get("startDateStruct", {})
    start_date = checked_date(start.get("date"))
    start_type = start.get("type")
    if start_type not in (None, "ACTUAL", "ESTIMATED"):
        raise ValueError("Unknown trial start date type")
    phases = design.get("phases", [])
    if not isinstance(phases, list) or not isinstance(status.get("overallStatus"), str):
        raise ValueError("Missing registry phase or status")
    role = program.get("trial_roles", {}).get(nct, {})
    categories = role.get("ai_categories", program.get("ai_categories", ["molecular_design"]))
    if not categories or set(categories) - AI_CATEGORIES:
        raise ValueError("Unknown or missing AI-use category")
    comparison_start = checked_date(role.get("comparison_start_date"))
    analysis_date = checked_date(role.get("ai_first_report_date", program.get("ai_first_report_date")))
    # Later AI reanalysis cannot be retroactively counted from a conventional
    # trial's start. Platform trials use the in-scope comparison start.
    coverage_date = max(filter(None, [start_date, comparison_start, analysis_date]), default=None)
    return {"id": nct, "program_id": program["id"], "title": identity["briefTitle"],
            "url": "https://clinicaltrials.gov/study/" + nct,
            "phases": phases, "status": status["overallStatus"],
            "status_updated": checked_date(status.get("lastUpdatePostDateStruct", {}).get("date")),
            "start_date": start_date, "start_type": start_type,
            "ai_categories": categories, "coverage_date": coverage_date,
            "comparison_start_date": comparison_start,
            "ai_first_report_date": analysis_date,
            "scope_note": role.get("scope_note", program.get("timing_note")),
            "conditions": protocol.get("conditionsModule", {}).get("conditions", []),
            "why_stopped": status.get("whyStopped"),
            "interventions": [item["name"] for item in matched]}


def collect_trials(fetch, catalogue=None, max_pages=10):
    catalogue = catalogue or load_catalogue()
    records, searches = {}, []
    for program in catalogue["programs"]:
        query = " OR ".join('"' + alias + '"' for alias in program["aliases"])
        token, seen_tokens, retrieved = None, set(), set()
        for _ in range(max_pages if program.get("trial_scope") != "explicit" else 0):
            params = {"query.intr": query, "format": "json", "pageSize": 100}
            if token:
                params["pageToken"] = token
            result = json.loads(fetch(API + "?" + urlencode(params)))
            studies = result.get("studies")
            if not isinstance(studies, list):
                raise ValueError("ClinicalTrials.gov did not return a study list")
            for study in studies:
                item = normalize_study(study, program)
                if item:
                    retrieved.add(item["id"])
                    if item["id"] in records and records[item["id"]]["program_id"] != program["id"]:
                        raise ValueError("Trial matches multiple curated programs; review required")
                    records[item["id"]] = item
            token = result.get("nextPageToken")
            if not token:
                break
            if token in seen_tokens:
                raise ValueError("ClinicalTrials.gov repeated a page token")
            seen_tokens.add(token)
        else:
            if program.get("trial_scope") != "explicit":
                raise ValueError("Trial query exceeded page cap; preserving previous snapshot")
        # Verify seeded IDs as well: alias search may miss a recently indexed trial.
        for nct in program["trial_ids"]:
            if nct not in retrieved:
                item = normalize_study(json.loads(fetch(API + "/" + nct)), program)
                if item is None or item["id"] != nct:
                    raise ValueError("Seeded trial does not match its curated molecule: " + nct)
                if nct in records and records[nct]["program_id"] != program["id"]:
                    raise ValueError("Trial assigned to multiple programs")
                records[nct] = item
        searches.append({"program_id": program["id"], "query": query if program.get("trial_scope") != "explicit" else None,
                         "scope": program.get("trial_scope", "molecule")})
    return {"fetched_at": now(), "catalogue_hash": digest(catalogue),
            "trials": sorted(records.values(), key=lambda item: item["id"]), "searches": searches}


def refresh_trials(store, fetch):
    snapshot = collect_trials(fetch)
    path = store.root / "clinical_trials.json"
    previous = json.loads(path.read_text()) if path.exists() else None
    old = {item["id"]: item for item in previous["trials"]} if previous else {}
    revisions = [item["id"] for item in snapshot["trials"] if item["id"] in old and item != old[item["id"]]]
    # Keep each complete normalized snapshot as well as raw HTTP provenance.
    history = store.root / "trial_snapshots"
    history.mkdir(exist_ok=True)
    (history / (digest(snapshot) + ".json")).write_text(json.dumps(snapshot, indent=2) + "\n")
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, indent=2) + "\n")
    temporary.replace(path)
    return {"trials": len(snapshot["trials"]), "programs": len(snapshot["searches"]), "revised_trials": revisions}


def dashboard_trials(store):
    catalogue = load_catalogue()
    reviewed = load_outcomes()
    common = {"programs": catalogue["programs"], "outcomes_reviewed_at": reviewed["reviewed_at"]}
    path = store.root / "clinical_trials.json"
    if not path.exists():
        return {**common, "trials": [], "outcomes": [], "available": False, "fetched_at": None}
    snapshot = json.loads(path.read_text())
    current = snapshot.get("catalogue_hash") == digest(catalogue)
    # Changed eligibility must be rechecked before it can affect a public count.
    trials = snapshot["trials"] if current else []
    eligible = {(trial["id"], trial["program_id"]) for trial in trials}
    return {**common, "trials": trials,
            "outcomes": [item for item in reviewed["outcomes"] if (item["trial_id"], item["program_id"]) in eligible],
            "available": current, "fetched_at": snapshot["fetched_at"]}
