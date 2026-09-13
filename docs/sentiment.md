# AI sentiment

The main **Sentiment** tab (`#sentiment`) shows reviewed public opinion surveys,
with **AI attitudes** and **Data centers** views.
The same series appear in the Leading indicators sentiment category and its
compact **All** views. As reviewed on September 13, 2026, coverage is 41 series
and 100 observations: 21 AI-attitude series and 20 data-center series. These are survey responses, not sentiment inferred from
headlines or social-media posts.

## Coverage

| Source | Measures | Population and waves |
| --- | --- | --- |
| Pew Research Center | More concerned than excited, more excited than concerned, and equally both | All U.S. adults; six irregular waves, November 2021 through June 2026 |
| Pew Research Center | Expect AI to lead to fewer or more U.S. jobs over the next 20 years | All U.S. adults; August 2024 and June 2026 |
| Ipsos AI Monitor | Excitement, nervousness, agreement that benefits outweigh drawbacks, and trust in companies using AI to protect personal data | U.S., Great Britain and Germany: 2023–2026; mainland China: 2024 and 2026 |

Pew's latest included fieldwork ran June 22–28, 2026 and was published August 18.
Each wave uses the probability-based American Trends Panel with weighting to the
U.S. adult population. The 2021 question included a longer explanation of AI.
The 2021–2023 waves used web interviews; the 2024–2026 waves included live
telephone interviews as well. These changes are retained in the series notes.
Sources: [latest Pew release](https://www.pewresearch.org/short-reads/2026/08/18/young-adults-in-the-us-are-increasingly-wary-of-ai-concerned-it-will-take-jobs/),
[topline with historical waves](https://www.pewresearch.org/wp-content/uploads/sites/20/2026/08/SR_26.08.19_young-adults-ai_topline.pdf)
and [latest methodology](https://www.pewresearch.org/wp-content/uploads/sites/20/2026/08/SR_26.08.19_young-adults-ai_methodology.pdf).

Ipsos's latest included fieldwork ran March 20–April 3, 2026 and was published
June 2. The selected countries use online surveys of approximately 1,000 people
per wave: ages 18–74 in the U.S. and 16–74 in the other three countries. China's
sample reflects a more connected, urban, educated and/or affluent population;
it should not be presented as covering all Chinese adults. Historical values
come consistently from the **2026 report vintage**, which can differ from the
original annual releases. Sources: [Ipsos 2026 release](https://www.ipsos.com/en/global-attitudes-ai-2026-wonder-vs-worry-divide-deepens)
and [report, including methodology](https://www.ipsos.com/sites/default/files/ct/news/documents/2026-06/Ipsos-AI-Monitor-2026.pdf).

## Refresh the displayed data

### Data-center surveys

The Data centers view distinguishes local construction attitudes from opinions
about energy, the environment and economic benefits. It shares the same catalogue
and refresh command as AI attitudes. Single-wave polls appear as percentage bars,
labelled as snapshots; only comparable questions within the same survey family
are connected over time. The series also appear in Leading indicators.

- **Pew, January 20–26, 2026:** perceived effects on energy costs, the environment,
  nearby quality of life, jobs and tax revenue, with good and bad responses shown
  separately. Values use the article's **all-adult denominator**, including people
  who had not heard of data centers. The impact question itself was asked only of
  aware respondents; the linked topline PDF reports that smaller denominator and
  its values must not replace the article's figures. The definition covers data
  centers for AI and other computing uses.
- **Gallup, March 2–18, 2026:** favor/oppose local construction specifically for
  AI. Use the published combined totals, rather than adding rounded components.
- **Ipsos Consumer Tracker, May 5–6, 2026:** local opposition, energy and
  environmental worry, and perceived economic and technological benefits.
- **Reuters/Ipsos, June 3–8, 2026:** concern about household electricity costs.
  This probability-based poll uses different wording and sampling from the May
  Consumer Tracker; the results are separate series.
- **Annenberg, February–March and June–July 2026:** repeated support/opposition
  toward local construction among U.S. adult citizens. Keep its citizen population
  and panel design distinct from the other national-adult surveys.

Primary evidence, exact fieldwork dates, sample sizes and methodology are stored
with every point and available under each chart's **Data & sources**. New releases
are reviewed using the process below. A changed question or population starts a
separate series unless comparability is established.

### Commands

From the repository root, using the existing data directory:

```bash
python3 -m aidash refresh --source leading-sentiment &&
python3 -m aidash export &&
python3 -m aidash build-dashboard
```

Reload the browser after this succeeds. The source is also included in
`python3 -m aidash refresh --source leading` and in the default
`python3 -m aidash refresh`.

The refresh imports and validates the checked-in
[`aidash/catalogue/sentiment.json`](../aidash/catalogue/sentiment.json), archives
the reviewed input and writes `data/leading/leading-sentiment.json`. It does not
search for new polls or extract new numbers from publishers. Without a catalogue
update, rerunning the command imports the same reviewed observations. No API key,
OpenRouter call or scheduled job is involved.

`export` prepares shared monthly data and `build-dashboard` writes the static
`dist/data/dashboard.json` consumed by the frontend. The site still needs no
running application backend or database connection. An existing localhost server
can remain running; for deployment, upload the complete prepared `dist/` tree.

## Add a new wave or correction

1. Read the primary publisher's questionnaire, topline tables and methodology.
   Confirm the question, response category, population, geography and weighting.
   Do not combine a differently worded question or different sample into an
   existing series without reviewing its comparability.
2. Update the appropriate series in `aidash/catalogue/sentiment.json`. Every
   `[date, value]` point requires a matching `point_details` record with the same
   date and value, fieldwork start/end, publication date, primary HTTPS evidence,
   population and methodology. The point date is the fieldwork end date.
3. Retain publication and vintage information separately from fieldwork. For
   revised historical Ipsos values, record when the displayed vintage was
   published and retain the original wave release date when available. Update
   `reviewed_at` and document any source revisions or breaks.
4. Run the three-command sentiment refresh sequence above. The loader checks
   percentages, evidence matching and date ordering before replacing its stored
   snapshot. A failed import retains the previous successful snapshot; resolve
   the reported validation failure before exporting and building.

## Interpretation

- Pew's three concern/excitement responses are alternatives within one question.
  Their displayed shares may not sum to 100 because of rounding and omitted
  nonresponses.
- Ipsos excitement and nervousness come from separate agreement questions.
  People may agree with both; one is not the complement of the other. The trust
  measure concerns protection of personal data by companies using AI, not model
  accuracy or general confidence in AI.
- U.S. Pew and U.S. Ipsos observations have different questions, age coverage and
  sampling methods. Compare each series over time within its definition; do not
  pool them into a national or global sentiment score. Changing sets of countries
  also make successive Ipsos all-country averages unsuitable as a fixed-population
  global trend.
- Survey waves are sparse. Missing years, including China in 2023 and 2025, are
  not zeroes and are not interpolated or carried forward as new observations.
  Small movements can fall within survey uncertainty.
- The shared month limits fieldwork dates while using the latest reviewed source
  versions. It is **not an as-known-at-the-time backtest**: some values were
  released months after fieldwork, and historical values can be revised.
- Expectations about job losses measure public beliefs, not observed employment
  changes or a causal estimate of AI's effects.
