# AI & Society dashboard: landscape and product notes

Research date: September 11, 2026. Initial landscape research; the smaller implementation described in the project README supersedes the first-release scope below. Audience is provisionally curious, informed people following societal change. No accounts, watchlists, or visitor-specific state are planned.

## Product premise

A place to understand what has changed in society as AI develops and spreads. Organize around questions people care about: work, prosperity, physical infrastructure, scientific progress, and daily life. Capabilities and costs help explain changes but should not dominate the homepage.

The main return experience should be a shared monthly briefing: “What happened this month?” It should cover meaningful observations, new evidence, and newly validated or deployed applications. Preserve full historical charts and offer common country and discipline filters without storing visitor preferences.

## Existing products worth studying

| Product | Coverage and useful precedent | Implication for this project |
| --- | --- | --- |
| [Stanford DEL AI Economic Indicators](https://digitaleconomy.stanford.edu/project/indicators/) | Employment, macroeconomic transformation, adoption, and GDP-B consumer surplus; monthly releases. | Closest economic competitor. Broader societal coverage and a strong returning-reader experience need to justify a new product. |
| [Our World in Data: Artificial Intelligence](https://ourworldindata.org/artificial-intelligence) | Accessible charts spanning compute, investment, adoption, employment-related indicators, and deployment. | Strong precedent for chart explanations, sources, sharing, and long historical context. Check underlying third-party licenses before reusing data. |
| [Stanford AI Index](https://hai.stanford.edu/ai-index) | Annual synthesis across economics, capabilities, education, policy, and other domains. | Useful taxonomy and source discovery; refresh individual underlying series at their own cadence. |
| [OECD.AI live data](https://oecd.ai/en/data?selectedArea=ai-jobs-and-skills) | International research, talent, investment, compute, and skills indicators. | Useful international coverage, but the current page warns that updates are underway and some series may not be current. |
| [Epoch AI Trends](https://epoch.ai/trends) | Capabilities, compute, hardware, costs, and company indicators. | Borrow its clear quantitative framing and links from headline trends into methods. |
| [IEA Energy and AI Observatory](https://www.iea.org/data-and-statistics/data-tools/energy-and-ai-observatory) | Electricity, infrastructure, constraints, and AI applications in energy. | Strong domain-specific precedent; check report dates as well as dashboard dates. |

## Candidate source map

### Work and adoption

- **[Stanford Canaries](https://digitaleconomy.stanford.edu/project/indicators/canaries-dashboard/):** monthly employment trends grouped by occupational AI exposure and worker characteristics. Useful outcome comparison. Public charts exist; a reusable public data download was not verified. Proprietary ADP data and balanced-sample coverage constrain interpretation. Patterns are correlational.
- **[Census BTOS downloads](https://www.census.gov/hfp/btos/data_downloads):** biweekly US business adoption by industry, size and geography; downloadable spreadsheets. Strong ingestion candidate. The broader AI question introduced in November 2025 creates a break; the new series begins with the December 4 release. Preserve both definitions rather than joining them silently. [Wording documentation](https://www.census.gov/hfp/btos/downloads/AI%20Question%20Wording%20Updates.pdf).
- **[Indeed AI Tracker](https://github.com/hiring-lab/ai-tracker/blob/main/README.md):** country-level AI and generative-AI job-posting shares. Daily observations, seven-day trailing averages, refreshed monthly; public CSV under CC BY 4.0. This measures posting language, not realized hiring or displacement.
- **[Eurostat enterprise AI adoption](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Use_of_artificial_intelligence_in_enterprises):** annual country/sector/size comparisons, dataset `isoc_eb_ai`. Coverage generally begins at ten employees in selected sectors, so it is not directly interchangeable with US BTOS.
- **[Anthropic Economic Index](https://www.anthropic.com/economic-index):** periodic usage snapshots, task categories, automation/augmentation, and geography. Public research and underlying releases are useful for studying how Claude is used. Model and user-mix changes complicate historical comparisons; this is not a representative measure of all AI usage.
- **[ILO occupational exposure](https://www.ilo.org/resource/news/one-four-jobs-risk-being-transformed-genai-new-ilo%E2%80%93nask-global-index-shows):** global modeled exposure, suitable for a structural map or employment stratification. Exposure is not a job-loss probability and is not a high-frequency outcome series.
- **[Microsoft AI Diffusion](https://blogs.microsoft.com/on-the-issues/2026/05/07/the-state-of-global-ai-diffusion-in-2026/):** periodic international adoption estimates based on adjusted telemetry. Potential non-OECD coverage; keep the measurement population and methodology visible.

### Economy, infrastructure, and supply chains

- **[Federal Reserve AI buildout framework](https://www.federalreserve.gov/econres/notes/feds-notes/the-ai-buildout-and-the-economy-publicly-available-data-to-assess-ais-impact-20260717.html):** July 2026 research note and compiled workbook covering investment, adoption, productivity, and labor. Useful source catalog and a worked approach to investment contributions adjusted for imports. The workbook is a snapshot, not a promised live feed. Its expenditure groups are proxies for AI-related activity.
- **[BEA open data](https://www.bea.gov/open-data):** quarterly national accounts and annual detail for investment and sector output. Separate data-center investment was added in the [2025 annual update](https://apps.bea.gov/scb/issues/2025/11-november/1125-nea-annual-update.htm), with history from Q1 2020. BEA discusses the absence of a dedicated AI line item in its [experimental AI estimates](https://www.bea.gov/research/papers/2026/early-estimates-impact-ai-within-beas-industry-economic-accounts). The old [Digital Economy Satellite Account](https://www.bea.gov/data/special-topics/digital-economy) is discontinued.
- **[Census construction spending](https://www.census.gov/construction/c30/historical_data.html):** monthly private data-center construction spending. Track seasonally adjusted and unadjusted definitions carefully. Includes non-AI facilities and excludes servers and other equipment.
- **[Epoch AI Chip Sales](https://epoch.ai/data/ai-chip-sales):** quarterly/annual estimates of units, compute delivered, spending, and nominal power; public downloads. Page updated August 27, 2026. Counts are estimated; shipments do not establish that hardware is installed, and nominal chip power is not metered electricity consumption.
- **[IEA Key Questions on Energy and AI](https://www.iea.org/reports/key-questions-on-energy-and-ai):** 2026 energy report and associated data. Use historical estimates separately from future scenarios. World/regional figures are easier to support than universal country detail.

Distinguish the supply chain **building AI** (semiconductors, memory, packaging, data centers, power) from AI **changing other supply chains** (planning, procurement, warehousing, transport). Start the second with measured adoption and selected outcome studies. Universal public series for attributable cost or delivery-time improvements were not established in this research.

Do not sum company capex, chip sales, building expenditure, and national-account investment: they overlap. Imported equipment contributes to investment expenditure while imports are subtracted in domestic GDP accounting. Separate investment contributions, producer value added, downstream productivity estimates, and consumer welfare rather than merging them into one number.

### Science, health, and society

- **[Stanford AI Index: Science](https://hai.stanford.edu/ai-index/2026-ai-index-report/science):** annual field-specific publication trends, benchmarks, and curated milestones; new standalone science chapter in 2026. Useful starting taxonomy, not a comprehensive discovery registry.
- **[OpenAlex works](https://help.openalex.org/data/works/attributes/):** dates, DOIs, disciplines/topics and citations enable publication shares and research trends. [Current bulk cadence](https://help.openalex.org/access/sync/) is quarterly for free snapshots and daily for paid snapshots. Requires a validated classifier distinguishing research using AI from research about AI. Normalize citations by field and publication age.
- **[FDA AI-enabled devices](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices):** periodically updated CSV/Excel with decision dates and specialties. Good historical authorization series and new-entry feed. The list is incomplete; use “authorizations,” not “approvals” for every pathway. Authorization does not establish improved population health.
- **[ClinicalTrials.gov API](https://clinicaltrials.gov/data-about-studies/learn-about-api):** weekday registry refreshes; trial starts, completions, results, disease areas and countries. Validate AI relevance and deduplicate records. Starting a trial is research activity, not a successful clinical result.
- **[OECD incident monitor](https://oecd.ai/en/incidents):** continuously collected news about incidents and hazards. Separate harms that occurred from potential hazards. Reporting volume is not harm prevalence; mark the November 2024 break described in its [methodology](https://oecd.ai/en/incidents-methodology).
- **[Gallup Gen Z AI survey](https://news.gallup.com/poll/708224/gen-adoption-steady-skepticism-climbs.aspx):** repeated adoption and attitude measures for slower-moving education context. Keep survey questions and populations consistent; adoption and self-reported time savings are distinct from learning outcomes.

## Defining scientific milestones

Use “AI-enabled scientific milestones” with a public inclusion rubric. No defensible universal breakthrough-count feed was identified.

One record should represent one underlying discovery, with primary paper, discipline, substantive AI contribution, event date, and evidence. Deduplicate preprints, published papers, announcements, and follow-ups. Record peer review, experimental confirmation, independent replication or proof verification, and deployment as separate evidence fields: these stages do not always occur in a strict sequence.

Offer quarterly counts by discipline and evidence level plus a browsable event timeline. Pair this curated collection with publication shares, trial results and authorizations. Avoid a total score that equates an untested material prediction with a validated drug or mathematical result.

## Suggested first release

Start with roughly 12–15 charts across work, adoption, investment/buildout, and science/health, plus a small milestone feed. Prioritize reliable public downloads before proprietary or manually maintained series. Include US depth, comparable OECD/European indicators where definitions align, and explicit global coverage where sources support it. Missing data should stay missing.

The homepage should answer: what changed, who is affected, how substantial is it, and how strong is the evidence? A chart should expose source, observation period, release date, units, population, uncertainty, definition changes and next expected update. Show annual sources at annual frequency. Use source-specific chart histories and versioned releases so revisions are distinguishable from new outcomes.

Separate **observed outcomes**, **adoption/usage**, **modeled exposure/proxies**, and **estimated causal effects**. Study-based causal estimates belong in an evidence collection with population, comparison design and uncertainty; do not turn sparse studies into a continuous “jobs lost to AI” line.

Reasons to return: a shared monthly change briefing, historical country/occupation/discipline comparisons, and updates when a claim gains stronger evidence or reaches deployment. Later additions could cover education outcomes, consumer benefits, creative work, public trust, and reported harms as consistent sources become available.
