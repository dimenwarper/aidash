# AI: A Macro View

A shared “What happened this month?” dashboard of AI's effects on jobs,
supply chains, leading indicators, medical devices, drug trials and mathematics. There are no
accounts or visitor state. The frontend is plain HTML, CSS and JavaScript;
the Python pipeline produces the data it displays.

The served site is **static**: `dist/` contains HTML, CSS, JavaScript, map assets
and the generated `data/dashboard.json`. It needs a static HTTP host, with no
running Python application, API server or database connection. Python and SQLite
are used separately to collect, review and export data; optional OpenRouter
calls run in that pipeline, never in the browser. To publish an updated site,
prepare the JSON first and upload the complete `dist/` directory, including that
generated snapshot (which is not tracked in Git).

## Start locally

Requires **Python 3.9+** on macOS/Linux, internet access for source downloads,
and no third-party Python packages. Node.js is only needed for the UI checks.
Run all commands from the repository directory. On a fresh machine:

```bash
git clone https://github.com/dimenwarper/aidash.git
cd aidash
```

Prepare the data (also the normal repeat-refresh command):

```bash
python3 -m aidash refresh &&
python3 -m aidash export &&
python3 -m aidash build-dashboard
```

After that succeeds, start the local server:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open [AI: A Macro View](http://127.0.0.1:8765/). The main tabs and supply-chain
subtabs switch views. The month selector limits observation/event dates and
starts at the latest exported month.

A fresh clone has no database or generated dashboard snapshot: `data/` and
`dist/data/` are git-ignored. The source code, reviewed catalogues and local map
assets are committed. Initial preparation downloads the public data and imports
the catalogues. No API key or OpenRouter call is needed for this sequence.
Google Fonts are optional; local/system fonts provide fallbacks.

## Refresh again

Rerun the same three-command sequence above, then reload the browser. Keep the
existing `data/` directory: it holds source history, review records and raw
responses. An already-running local server can stay running. It serves the
prepared `dist/data/dashboard.json`; opening the page does not fetch source
feeds or trigger ingestion.

- `refresh` updates every default source, including all five activity sources,
  the trial registry, mathematical-news discovery queue and five leading-indicator sources.
- `export` defaults to the current calendar month and rewrites previously
  exported months with the latest corrections. To add a specific month, use
  `python3 -m aidash export --month 2026-09` before `build-dashboard`.
- `build-dashboard` assembles the latest stored observations and reviewed
  catalogues into the public snapshot. It does not download data.
- `&&` stops the sequence on a failed or partial refresh, preserving the
  previously served dashboard until you resolve or explicitly accept that gap.

The default discovery window is the previous **90 days through today**.
`--from` and `--to` affect only math-news and optional science discovery;
they do not truncate quantitative histories or trial searches. Overlapping
refreshes deduplicate observations and candidates. A new export month alone
does not imply that every source has released data for that month.

## What has a pipeline?

Every displayed section is assembled by `build-dashboard`, but not every input
is discovered or approved automatically. **Scheduling is not enabled.**

| Dashboard input | Refresh command / source | What updates automatically | What still needs review or maintenance |
| --- | --- | --- | --- |
| Jobs: AI share | `refresh --source indeed` | [Indeed AI Tracker](https://github.com/hiring-lab/ai-tracker) CSV histories | Schema/definition changes need adapter review; country names and macro coverage may need updates. |
| Jobs: macro overlay | `refresh --source macro` | Indeed total postings and BLS/OECD series through [FRED](https://fred.stlouisfed.org/) | No causal estimate of AI job losses or representative OECD total. |
| AI infrastructure: semiconductor output | `refresh --source supply-chain` | Fed industrial production via FRED | Broad chip output includes non-AI activity. |
| AI infrastructure: DRAM prices, computing investment, construction, cloud capex | `refresh --source supply-chain` | Re-downloads the configured Fed workbook | **Dated July 17, 2026 compilation**; rerunning may return unchanged data. A newer workbook or direct feeds require an adapter/source review. |
| AI adoption | `refresh --source supply-chain` | Eurostat annual histories for five sectors and two operational-use measures | Survey-definition changes need review. |
| Other retained industry indicators | `refresh --source supply-chain` and `refresh --source activity` | FRED prices, Ireland CSO electricity, U.S. Census/FRED, Taiwan MOEA and EIA feeds | Some feeds remain in exports although their former Activity/Adjacent industries UI tabs were removed. |
| Trade flows and material trends | `refresh --source activity-trade` | UN Comtrade annual exports from 2019 through the previous calendar year | Coverage is limited to configured reporters and HS products; incomplete reporters remain explicit. |
| EUV / company numeric histories | `refresh --source activity-companies` | Imports the reviewed company catalogue into observations | **Does not scrape new filings**; add sourced observations after reviewing reports. |
| EUV machine, supplier links, material definitions and globe geography | `build-dashboard` plus static frontend assets | Reassembles reviewed metadata | Diagram, relationships, events and geography are maintained in source/catalogue files. |
| Medical devices | `refresh --source fda` | [FDA AI-enabled device authorizations](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices) | List/schema changes may require an adapter update. Authorizations are not trial successes. |
| Drug trial dates, phases and registry status | `refresh --source trials` | [ClinicalTrials.gov](https://clinicaltrials.gov/data-api/api) searches for reviewed programs | New drugs, eligible NCT IDs and AI-role categories require primary evidence and catalogue review. |
| Drug trial successes / outcomes | `build-dashboard` | Loads reviewed outcomes matching the current trial snapshot | Endpoint results and success labels are manually reviewed; registry completion never implies success. |
| Math breakthroughs | `refresh --source math-news`, then review and build | Searches Google News RSS and archives candidates | New entries, novelty, AI role and proof status require primary-source review; headlines never become counts automatically. |
| Leading indicators: public feeds | `refresh --source leading` (also in default refresh) | FRED macro indicators, Census BTOS, Stanford/ADP rolling employment indexes and METR task horizons | Methodology changes need review; these are signals and broad proxies, not causal AI estimates. |
| Leading indicators: reviewed releases | `refresh --source leading-reviewed` | Imports the reviewed price, delegation, robotics, ASML and Virginia power histories | **New reports require review**; the import does not discover new disclosures. Charts label historical/discontinued coverage. |
| Leading indicators: activity and science context | Existing activity, supply-chain and trial sources, then `build-dashboard` | Reuses existing snapshots and derives trial counts | Outcome evidence and eligible trial coverage remain reviewed; no representative phase-transition success rate. |
| Overview | `build-dashboard` | Derives summaries from the same datasets | Has no separate discovery pipeline. |
| Optional paper discovery and OpenRouter extraction | `refresh --source science`, then `extract` / `review` | Europe PMC search and optional paid structured extraction | Separate from the displayed math/trial catalogues; excluded from default refresh. |

No pipeline currently estimates AI-attributable GDP or provides a complete
census of scientific breakthroughs. Missing observations remain missing.

## Run individual sources and handle failures

These examples are run from the project directory:

```bash
python3 -m aidash status
python3 -m aidash refresh --source indeed
python3 -m aidash refresh --source macro
python3 -m aidash refresh --source leading
python3 -m aidash refresh --source supply-chain
python3 -m aidash refresh --source activity
python3 -m aidash refresh --source fda
python3 -m aidash refresh --source trials
python3 -m aidash refresh --source math-news --from 2026-08-01 --to 2026-09-12
```

`activity` is a group of five sources, also individually selectable:
`activity-us`, `activity-taiwan`, `activity-energy`, `activity-trade`, and
`activity-companies`. All five already run in the default refresh.

The `leading` group contains `leading-economy`, `leading-btos`,
`leading-canaries`, `leading-metr`, and `leading-reviewed`. For exact feeds,
reviewed-release instructions and interpretation limits, see
[Leading indicators](docs/leading-indicators.md).

`refresh` records each source's success/failure and returns nonzero if any fails
or is partial. Other sources can still finish, and a rejected source snapshot
retains its previous observations. Use `status` to inspect the source and error,
then retry that source. Schema/history-validation failures need investigation;
rerunning cannot fix a changed source format. Comtrade may have reporting gaps
even after a successful request.

Once a retry succeeds, run `export` and `build-dashboard`. If you deliberately
accept a failed source's retained older data, you can run those two commands
without retrying; check the failure and source dates before treating the result
as current. With no prior snapshot, failed sources can remain unavailable.

For an alternate persistent directory, put the global option **before** each
subcommand, consistently:

```bash
python3 -m aidash --data-dir /path/to/aidash-data refresh &&
python3 -m aidash --data-dir /path/to/aidash-data export &&
python3 -m aidash --data-dir /path/to/aidash-data build-dashboard
```

One command at a time may write to a given data directory. Only `dist/` should
be served; database, raw responses, abstracts and API keys remain outside it.

## Update reviewed inputs

| Change | Edit after checking primary evidence | Then run |
| --- | --- | --- |
| New math result or corrected verification status | [`aidash/catalogue/math_news.json`](aidash/catalogue/math_news.json); keep one entry per distinct result, source links and `reviewed_at` | `export`, then `build-dashboard` |
| New drug, eligible trial or AI-use category | [`aidash/catalogue/drugs.json`](aidash/catalogue/drugs.json) | `refresh --source trials`, then `export` and `build-dashboard` |
| Trial endpoint/success report | [`aidash/catalogue/trial-outcomes.json`](aidash/catalogue/trial-outcomes.json); use a matching program/NCT ID, result date and evidence | `export`, then `build-dashboard`; refresh trials first if adding a study |
| New company filing or EUV supplier history | [`aidash/catalogs/company-activity.json`](aidash/catalogs/company-activity.json); retain units, fiscal periods and per-point sources | `refresh --source activity-companies`, then `export` and `build-dashboard` |
| EUV supplier relationship or project event | Nodes, edges and milestones in the company catalogue; drawing in `dist/euv-machine.js` if needed | `export`, then `build-dashboard` and reload |
| Trade product or material scope | `aidash/sources/trade.py`, `aidash/catalogs/material-commodities.json` and `aidash/catalogs/trade-activity.json`, as applicable | Validate request sizes/HS definitions, refresh `activity-trade`, export and build |

Math candidates live in `data/math_news_candidates.json`; open this JSON file
to review the queue. `candidates`, `extract` and `review` CLI commands operate on
the **optional paper queue**, not math-news candidates or drug outcomes. OpenRouter
does not currently automate math novelty checking, company-filing ingestion or
trial-success adjudication. The publication catalogues are edited directly after
review; database review commands do not update them.

For a JSON-only change, validate before rebuilding:

```bash
python3 -m json.tool aidash/catalogue/math_news.json > /dev/null
python3 -m unittest discover -s tests
```

The appropriate loader also validates the catalogue during its refresh or build.
See [value-chain coverage and definitions](docs/value-chain-activity.md) for the
supplier/import structure and trade limitations.

## Jobs and supply-chain definitions

The Jobs overlay rebases selected series to 100 in their first common positive
reference month within the chosen range. Indeed series use the last daily value
of each completed month; BLS/OECD monthly observations retain their reference
month. Missing periods break lines; there is no forward fill. The AI share is a
share, not an AI employment count. We do not multiply it by the seasonally adjusted
total-postings index. U.S. unemployment covers age 16+; OECD harmonized series use
15+, with UK observations referring to the middle month of rolling quarters.
Every macro card retains its own date, definition and source link.

The Scale selector also offers **Normalize to 0–100**. Each selected series uses
its own minimum and maximum within a common window, ending at the earliest last
observation among selections. A constant series sits at 50, zero observations
remain valid, and gaps stay missing. Original values are preserved on hover.
This gives trends equal vertical range without implying equal economic changes.

Supply chain opens on **Overview**, with all five infrastructure indicators and
11 trade-product trends shown together. Charts are grouped into AI infrastructure,
chip/equipment trade and materials trade. Each shows its latest value, date,
year-over-year change and a small history in its own units and vertical scale.
Selecting a chart opens the corresponding infrastructure history or trade product.

Trade overview totals use only directed routes with explicit observations in
**every displayed year**. This matched route set prevents missing reporters from
creating false growth or declines. Explicit zeros remain valid; missing routes
are excluded throughout. Route counts are displayed, and totals represent a
subset of covered exports, not world trade. Changing the shared month may change
the eligible years and matched set. The detailed Trade flows view preserves all
reported routes and their per-product/year coverage.

Other subtabs are Trade flows, EUV equipment, AI infrastructure and AI adoption.
Activity and Adjacent industries are no longer UI tabs. The trade globe supports
rotation and zoom, and stops animating when hidden or reduced motion is requested.
Natural Earth geometry and pinned D3/TopoJSON bundles are served locally, with
licenses in `dist/assets/` and `dist/vendor/`.
AI adoption shows all five sector histories on one annual percentage chart;
selecting a sector opens its individual history and operational-use measures.

Supply chain covers semiconductor output, Korean DRAM prices, U.S. computing
equipment investment and data-center construction, selected cloud-firm capex,
Irish data-center electricity, transformer prices and global copper prices.
Eurostat adds EU manufacturing, trade, transport/storage, energy and construction
AI-adoption rates plus production-process and logistics use. Those percentages
use all enterprises with 10+ persons employed as their denominator. There is no
2022 survey observation; the 2025 AI definition expanded. The operational series
are reachable through “Explore history” on manufacturing and transport cards.

All source responses are archived. Fed workbook data is a dated July 17, 2026
compilation, not a continuously revised underlying-source feed. Monthly/quarterly
reference dates are stored at period end; annual adoption observations at year
end. Dates describe observations, not when a historical user could have known
them. Infrastructure proxies include non-AI activity; capex, equipment and
construction overlap and cannot be summed. Advanced packaging, networking and
cooling remain explicit coverage gaps. New source snapshots must meet minimum
history coverage and pass checks for unexpected loss of existing history.

## Drug trials and math breakthrough counts

`aidash/catalogue/drugs.json` holds reviewed identities, aliases, exact NCT
identifiers and primary evidence for AI involvement. Roles are **molecular
design**, **target selection**, **repurposing**, **recruitment** and **trial
analysis**. Roles overlap, but the All view counts each registry ID once. Current
coverage includes rentosertib in both design and target selection, BEN-8744 target
selection, baricitinib COVID-19 repurposing, and secondary/supplemental pathology
analysis in MAESTRO-NASH and IMPACT. Recruitment has no verified therapeutic drug
trial yet; this is a coverage gap, not evidence of no industry activity.

Molecular-design programs use paginated intervention-alias searches plus seeded
IDs. Other programs use `trial_scope: explicit` to fetch only individually
verified studies. All records must still match a drug/biological intervention in
an interventional study. An ordinary trial of a repurposed or later AI-analyzed
molecule is not automatically included.

Unique programs and unique NCT studies count separately. Registry start must be
`ACTUAL` and occur by the selected month. Later AI analyses enter at their first
report date; RECOVERY uses the start of its baricitinib comparison, not the
platform start. Estimated starts remain visible but do not count. Historical
counts use the latest reviewed evidence, not an archive of what was known in
each month. Status and phase reflect the latest registry record. Terminated
trials retain their historical activity; combined Phase 1/2 does not establish
that a Phase 2 cohort began.

`aidash/catalogue/trial-outcomes.json` holds separately reviewed endpoint results,
report dates and sources. **Trial results** shows primary efficacy endpoints met,
positive safety readouts, mixed/negative results and discontinuations. Registry
completion, dose selection and phase progression never imply success. Success
series count unique trials per endpoint type; a newer result replaces an earlier
result of the same type. A clinical result predating AI analysis enters the AI
result series only at the later AI disclosure date. No causal AI benefit or
industry success rate is inferred from this curated sample. Outcomes require
manual evidence review; registry refreshes update facts, not success labels.

The current complete registry snapshot is `data/clinical_trials.json`; prior
normalized snapshots live in `data/trial_snapshots/`, and raw responses retain
fetch provenance. A failed query or unmatched seed preserves the previous
snapshot. Changing the drug catalogue requires another successful registry
refresh before counts appear. Only outcomes matching a refreshed trial and its
program are exported to the dashboard.

`aidash/catalogue/math_news.json` contains reviewed reports about major new
mathematical results found through news searches. Each result links to news
coverage or public expert reports and primary research, states AI’s role, and distinguishes claimed
solutions, expert-checked disproofs and partial advances. Several news articles
about the same result count once. Known-proof formalizations, including the
previous HOL Light catalogue, and olympiad scores are excluded. Formal certificates
for genuinely new discoveries remain eligible; the discovery, not the later
formalization, is counted. Related bound families in one paper share a card;
separately named conjectures or distinct equation formulations have separate cards.

The [September 12 coverage review](docs/math-coverage-review-2026-09-12.md)
records the historical and recent omission pass, source checks, corrections and
deferred candidates. It audits reported evidence, not mathematical proof validity.

`refresh --source math-news` searches Google News RSS within the requested date
window and archives the responses. Queries cover general announcements, new
bounds and counterexamples, group theory, geometry, fluid equations, percolation
and named AI mathematics systems. Overlapping searches deduplicate by article
URL in `data/math_news_candidates.json`; this is a discovery queue, not a proof
count. Failed searches preserve the previous queue. Headline-only matches never
automatically enter the dashboard. Review significant reports against the
underlying paper or announcement, update `math_news.json`, then rebuild the
snapshot. Status reflects the latest review; dates reflect first public reports.
The count measures covered breakthroughs, not a complete census or a count of
conclusively solved theorems.

## Optional paper-discovery workflow

Europe PMC discovery and OpenRouter extraction are an optional CLI workflow.
They are separate from the dashboard's drug-trial and math-breakthrough counts.

```bash
python3 -m aidash refresh --source science --from 2026-08-01 --to 2026-08-31 --max-pages 30
```

Science defaults to two pages of 100 records. Capped or inconsistent results
are stored as `partial` with a nonzero exit code. Increase `--max-pages` or split
the dates; repeating a capped window does not resume pagination. A complete
response only means that query was retrieved, not that all discoveries were
found. Rerun older windows periodically for late indexing and revised abstracts.

```text
Search primary literature → archive and deduplicate → optional LLM extraction
→ editorial review → shared monthly export
```

Discovery creates **unreviewed candidates**. Inspect the queue:

```bash
python3 -m aidash candidates --limit 20
```

Optional extraction uses **OpenRouter** and reads `OPENROUTER_API_KEY` from the
environment. The default model is `openai/gpt-4.1-mini`, routed through OpenRouter;
override it with `OPENROUTER_MODEL` or `--model` (which takes precedence). The
chosen model must support structured outputs. Export the key in the shell before
running `extract`; `.env` is not loaded automatically. It makes at most one paid request
per selected paper, with five papers per invocation by default:

```bash
python3 -m aidash extract --limit 5
# Optional override using an OpenRouter model ID:
python3 -m aidash extract --model openai/gpt-4.1-mini --limit 1
python3 -m aidash candidates --limit 20
```

Only citation metadata, title and abstract are sent to OpenRouter and its selected
model provider. The key is never saved to the database or printed. Extraction
uses OpenRouter's [structured-output API](https://openrouter.ai/docs/guides/features/structured-outputs)
with `require_parameters: true`, validates the response locally, requires an
exact supporting quotation, and saves model, prompt version
and source-content hash. Repeated runs skip matching extractions. Refusals,
incomplete responses and fabricated quotations fail without publishing. LLM
stage labels describe a paper's claim; they do not verify it. Abstracts may omit
essential limitations, so review should consult primary evidence.

After checking a paper, record a decision. Replace the placeholders below with
an actual candidate ID, event date and reviewed evidence:

```bash
python3 -m aidash review DOCUMENT_ID --decision publish \
  --notes "Describe the evidence checked and remaining limitations" \
  --event-date YYYY-MM-DD \
  --summary "A concise, evidence-supported account of the result" \
  --discipline biology --evidence-stage experimentally_tested \
  --evidence-url https://example.org/primary-evidence

python3 -m aidash review DOCUMENT_ID --decision reject \
  --notes "Explain why this is not an eligible milestone"
```

Reviews are append-only. Changed title, abstract, DOI, date, source URL or metadata makes
the old decision stale and removes the entry from subsequent public exports
until it is reviewed again. A publication date and a milestone's event date are
separate. Duplicate preprints/journal papers with different DOIs still need
editorial deduplication. Rejected candidates remain in the internal record.

## Outputs and provenance

- `data/aidash.sqlite3`: observations, revisions, discovery documents,
  extraction results, review history, and run logs.
- `data/raw/<sha256>.blob`: content-addressed source responses. Every retrieval
  records its URL, timestamp and hash, even when bytes are unchanged.
- `data/public/YYYY-MM.json`: shared monthly indicators, reviewed milestones,
  source metadata, observation dates and latest run status.
- `data/public/series.json`: complete current normalized time series for charts.

Exports contain the latest known source versions, including historical
revisions; they are not an “as known at the time” reconstruction. Every export
also rebuilds previously exported months so corrections and rejections reach
historical pages. Monthly changes compare the latest observation in the target
month with the last available one in the immediately preceding calendar month,
using percentage points for posting shares. Both dates are included. These are
endpoint comparisons, not monthly averages. A missing preceding month makes the
change null. If a source has
no observation in the target month, the last known value is marked accordingly
and its change is null. No milestones means no reviewed entries, not no progress.

## Operations and verification

No scheduler is installed. For periodic runs, a scheduler must use this repository
as its working directory, an available Python executable and the same persistent
data directory. Run refresh → export → build sequentially and keep the refresh
exit code visible. A weekly run is a reasonable starting point; annual and
quarterly sources will often be unchanged. The default refresh searches math
news, but approving new results remains manual. Optional OpenRouter extraction
is a separate paid operation and is never invoked by this refresh sequence.

Back up the whole `data/` directory while no writer is running, including the
SQLite database, raw responses, trial snapshots and math-news queue. Keep reviewed
catalogue changes in Git. Public exports and the dashboard snapshot can be
rebuilt; they are not a substitute for the source/review history. Commands sharing
a data directory cannot run concurrently because the pipeline holds a writer lock.

Run the offline checks from a clean clone (no API key or network required):

```bash
python3 -m unittest discover -s tests
node tests/dashboard_ui.mjs
node tests/globe.mjs
node tests/leading_ui.mjs
node tests/leading_overview_ui.mjs
```

After initial data preparation, also run the snapshot integration checks:

```bash
node tests/trials_ui.mjs
node tests/activity_ui.mjs
```

Those two checks read the generated `dist/data/dashboard.json`, which is not in
Git. They verify the reviewed September 2026 snapshot as well as calculation
behavior; source backfills or catalogue changes may require reviewing their
snapshot expectations. Python tests use synthetic fixtures and mocked HTTP/LLM
responses. The JavaScript checks exercise calculations and rendering code without
a browser; they do not constitute screenshot or visual-layout verification.

See [landscape and source research](docs/landscape-and-product-notes.md) and
[value-chain coverage, refresh details and definitions](docs/value-chain-activity.md).
