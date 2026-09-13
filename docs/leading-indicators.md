# Leading indicators

The main `#leading` tab groups source observations into capability/cost,
adoption/delegation, hiring/employment, investment/capacity, economic outcomes,
science/medicine, and public sentiment. The **All** category has two compact layouts showing every
underlying variable: **Trendlines** and **Heatmap**. Category buttons open the
original detailed charts. Select a variable in either overview to open and focus
its detailed chart, including definitions and source evidence.

The overview starts with three years of history and retains its history choice
separately from the detailed categories. Both use the shared month cutoff.
Trendlines share one calendar axis and scale each variable independently, without
extending stale observations. Heatmap colors normalize each variable within its
own selected observed minimum and maximum: colors do not indicate good/bad or
comparable cross-variable magnitudes. Each cell uses the last observation in its
period, not an average or sum. Missing and explicitly null observations remain
hatched; single observations and constant series use neutral symbols. Periods are
monthly for up to 18 months, quarterly for up to 60 months, and annual for longer
history. Asterisks mark partial boundary periods. The legend names the active
interval. Hover or focus cells for raw
values, units and dates; arrow keys move between cells and Enter opens detail.

Detailed charts have independent axes and explicit units. Related series share a
chart only when units match.

## Repeat refresh

From the repository root, with the existing data directory:

```bash
python3 -m aidash refresh --source leading &&
python3 -m aidash export &&
python3 -m aidash build-dashboard
```

Reload the existing localhost tab afterward. No OpenRouter or other API key is
needed. The normal `refresh` (without a source) includes this group, as well as
its reused activity and trial feeds. To update only those reused feeds, run
`refresh --source activity-us`, `refresh --source supply-chain`, and
`refresh --source trials` sequentially before exporting/building.

| Source ID | Input and coverage | Refresh behavior |
| --- | --- | --- |
| `leading-economy` | Ten public Census/BLS series via FRED: hiring, total layoffs/openings, business applications, productivity, real pay, labor share and service CPI | Downloads full configured histories from 2019. Monthly/quarterly observations use period ends. All rates/indexes retain source units and seasonal adjustment. |
| `leading-btos` | Census BTOS national current/expected AI use; six sectors; smallest/largest employer-size classes | Reads the three JSON feeds used by the Census dashboard. Collection-period end dates; estimates are already percentages. Expected use refers to the next six months. |
| `leading-canaries` | Stanford Digital Economy Lab/ADP employment indexes, ages 22–25 and 35–40, highest/lowest AI exposure quintiles | Reads the public ZIP/CSV. Replaces the whole rolling sample with a coherent source vintage, retaining its publication date. Does not append an old-sample prefix. |
| `leading-metr` | METR v1.1 50% and 80% task horizons | Downloads the YAML; filters each model's benchmark version, then derives a separate record frontier at each reliability level. Raw model coverage is checked independently of frontier revisions. |
| `leading-reviewed` | Epoch fixed-performance price history, Anthropic delegation shares, A3 robot orders, ASML equipment history and Dominion Virginia power commitments/connections | Imports the checked-in reviewed catalogue. **Does not discover new releases or scrape new report values.** |
| `leading-sentiment` | Pew U.S. concern/excitement and jobs expectations; Ipsos cross-country attitudes; Pew, Gallup, Ipsos and Annenberg data-center surveys | Imports `aidash/catalogue/sentiment.json`. **New survey waves require primary-source review.** Shared with the main Sentiment tab; no automatic discovery or text sentiment scoring. |
| Existing activity sources | U.S. computer/electronic product orders, shipments, inventories/backlog; Irish data-center electricity; cloud capex and computing-equipment investment | Reuses the supply-chain snapshot, without another download or separate copy of the source history. Capex/equipment use the dated July 2026 Federal Reserve compilation; a new compilation requires adapter review. |
| Existing trial sources | Included phase 2/3 trials and latest positive primary efficacy results | Recomputed from registry snapshots and reviewed outcome evidence. Registry phase is current, not historical transitions. |

The group uses independent `data/leading/<source>.json` snapshots, archived raw
responses in `data/raw/`, and refresh status in the shared SQLite database.
Each source replaces its snapshot atomically after validation. Errors retain its
last successful data; the tab displays failed/not-loaded source status. Other
sources can still succeed, but the CLI exits nonzero if any failed. Keep the
writer lock: never run refresh commands in parallel against the same directory.

## Reviewed releases

Edit `aidash/catalogue/leading-indicators.json` only after checking primary
reports. `series` contains reviewed values; `feed_definitions` describes the
public-feed adapters; `gaps` documents measures without a usable connected series.

For a new reviewed point:

1. Confirm the definition, denominator, unit, geography, observation period and
   whether the number is an actual, order, commitment, or forecast.
2. Add a unique dated point and its primary evidence URL in `point_details`.
   Record the source publication date and any rounding/period caveat. Do not add
   cumulative year-to-date values to standalone-quarter series.
3. Update `reviewed_at` / source version information. A methodology or sample
   change needs a separate series, not a splice.
4. Run `refresh --source leading-reviewed`, then `export`, `build-dashboard`
   and the checks below. Importing the catalogue archives the exact input file.

Public sentiment has its own catalogue and source: update
`aidash/catalogue/sentiment.json`, then use `refresh --source leading-sentiment`.
The full `leading` refresh imports both catalogues. See [AI sentiment](sentiment.md)
for wave coverage, methodology changes, publication lags and the complete command
sequence.

Primary endpoints and current limitations:

- [Census national](https://www.census.gov/hfp/btos/ai_national.json),
  [sector](https://www.census.gov/hfp/btos/AI_sector.json) and
  [size](https://www.census.gov/hfp/btos/AI_empsize.json): new wording begins
  November 2025. The earlier goods/services question is deliberately unspliced.
  JSON does not supply release dates; retrieval date is not a publication date.
- [Stanford public ZIP](https://storage.googleapis.com/aviary-del-public/release_memos/latest/downloads/canaries_age_by_exposure_results.zip):
  rolling balanced ADP sample, excludes firm entry/exit, index November 2022=100.
  This is neither all U.S. employment nor a causal estimate of displacement.
- [METR YAML](https://metr.org/assets/benchmark_results_1_1.yaml): restricted
  stdlib parser, not general-purpose YAML. Dates are model release dates, not
  evaluation-publication dates. Only record-setting central estimates appear;
  source model confidence intervals are in tooltips/tables. Above 16 human-expert
  hours the task suite cannot estimate horizons reliably. A new benchmark version
  needs review. Truncated model coverage fails rather than erasing recent results.
- [Epoch price data](https://epoch.ai/data/charts/llm-inference-price-trends/lowest_price_models_data.csv):
  reviewed historical MMLU ≥86% non-reasoning-model token-price frontier,
  3:1 input/output weighting. Last observation February 2025. This is not cost per
  successful business task and is explicitly labeled historical in the tab.
- [Anthropic monthly release documentation](https://huggingface.co/datasets/Anthropic/EconomicIndex/blob/main/release_2026_06_26/data_documentation.md):
  April–May 2026 cohorts; chat+Cowork and API excluding Claude Code stay separate.
  Automation shares exclude unclassified records; directive shares include them.
  Earlier seven-day samples are not spliced into the new monthly cohort.
- A3 public quarterly releases need review; raw order totals can change reporting
  cohorts. Do not label growth derived from them as A3's matched-cohort growth.
- ASML stopped publishing quarterly net bookings after Q4 2025. Keep that series
  visibly discontinued; do not fill later quarters with zeros or carry forward.
- Dominion contract-stage GW are capacity commitments, not operating load. Annual
  connected-site MW are ultimate site capacity, not metered draw. Observation
  months have month precision even though storage dates use the first day.

## Interpretation and checks

“Leading signal” means a capability, intention or commitment that might precede
an effect. “Broad proxy” includes non-AI activity. “Confirmation” is a realized
outcome, not a forward predictor. There is no composite AI score or causal GDP
estimate. Gaps include human intervention, task-level cost, component lead times,
power time-to-operation, quality-adjusted AI service prices and independently
validated discovery-to-deployment cohorts.

Sentiment records what survey respondents believe. Job-loss expectations are not
measured job losses, and opinion changes are not validated forecasts of adoption.
Pew and Ipsos ask different questions of different populations; their percentages
are not pooled into a single score. Sparse survey waves stay sparse in the compact
overview, and heatmap colors retain their within-variable meaning.

The shared month selector uses the latest available source versions and reviews;
it is **not** a point-in-time backtest. Exact dates and raw values remain in the
expandable data tables. Null observations break chart lines. There is no
interpolation or extension to the present. An old last observation remains dated.

```bash
python3 -m unittest discover -s tests
node tests/leading_ui.mjs
node tests/leading_overview_ui.mjs
node tests/dashboard_ui.mjs
```

Tests cover methodology boundaries, coherent rolling updates, null revisions,
truncated feeds, atomic failure recovery, unit separation, date/category filters,
late AI disclosure and replacement of positive trial outcomes by later mixed
results. All these checks use synthetic or checked-in catalogue data, without
network access or an API key.
