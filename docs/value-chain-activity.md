# Value-chain activity

The Supply chain panel opens on Overview, with Trade flows, EUV equipment, AI
infrastructure and AI adoption detail views. The Activity and Adjacent industries views have been removed.
The underlying industry feeds remain available in the pipeline and exports.
All measurements include non-AI activity unless their scope explicitly says EUV.

## Overview

The overview shows 16 mini trends: five infrastructure series and one aggregate
for each of 11 trade products. Trade uses a fixed set of routes with explicit
observations in every displayed year, so coverage losses do not create artificial
changes. Route counts and nominal USD units remain visible. These are subsets of
covered bilateral exports, not world totals. Each chart retains its own scale;
selecting it opens the corresponding detail view.

## Refresh

```bash
python3 -B -m aidash refresh --source activity
python3 -B -m aidash export --month 2026-09
python3 -B -m aidash build-dashboard
```

`activity` runs five independent snapshots, all already included in the default
`refresh`. Each can also be refreshed by name:

| Source | Measurement | Refresh method |
| --- | --- | --- |
| `activity-us` | Computer/electronic product orders, shipments, inventories, backlog | Census series via FRED CSVs; monthly flows and end-period stocks requested separately |
| `activity-taiwan` | Five detailed production indexes and six broader industry value series | Three MOEA open-data CSVs; ROC dates converted to Gregorian month ends |
| `activity-energy` | Utility-scale electricity generation and sales | EIA Monthly Energy Review Table 7.1 CSV; monthly rows only |
| `activity-trade` | Selected annual bilateral exports of chips, equipment and eight material categories | UN Comtrade public preview calls in batches of at most three codes per year; 28 requests in 2026, from 2019 through the previous calendar year |
| `activity-companies` | Supplier and foundry business histories | Import the reviewed `aidash/catalogs/company-activity.json`; new reports require review and a catalogue update |

The public feeds need no API key. Ingestion archives raw responses with URL,
timestamp and SHA-256, validates dimensions, units, duplicates and date formats,
and rejects snapshots that lose previously published history. One failed source
does not erase its prior snapshot or prevent other sources from refreshing.

Company imports archive the exact reviewed catalogue under a `catalog:` provenance
identifier; they do **not** claim to have fetched new company filings. Each numeric
point retains its own primary report URL and table/page locator. The static graph,
plans and approximate Micron disclosures are reviewed catalogue records. New LLM
extractions must not silently become approved company observations.

## Initial coverage and scope

- Taiwan: 2611 integrated circuits, 2613 packaging/testing, 2711 computers,
  2729 other communications equipment, and 2928 electronic/semiconductor machinery.
  Production indexes are 2021=100, not seasonally adjusted. Packaging is not
  advanced packaging alone, and computers/networking are not AI equipment alone.
- Taiwan industries 26 and 27 also have nominal production, shipment and inventory
  values in thousands of TWD. These are broader aggregates than the five detailed
  indexes. The UI formats currency in TWD billions without changing stored values.
- U.S. manufacturing data are nominal USD millions, seasonally adjusted. Order
  series exclude semiconductor orders. Inventory and backlog are stocks; orders
  and shipments are period flows.
- EIA figures are TWh (one billion kWh = one TWh), not seasonally adjusted.
  Generation excludes small-scale solar; sales exclude direct self-use. Month 13
  annual totals never enter monthly histories. Other table series with forecast
  or estimate components are not automatically imported.
- Company histories cover TRUMPF, ZEISS, ASML, VAT and TSMC: 46 points initially.
  TSMC provides physical wafer shipments and actual quarterly CapEx. ASML EUV
  system counts are **revenue-recognized systems**, not physical shipments.
  Companywide metrics are not assigned to individual production sites.
- Micron bit-shipment and selling-price descriptions retain reported approximate
  ranges; no midpoint is invented. Blank shipment descriptions are not zero.

## Trade map

HS 8542, 847150 and 848620 respectively cover integrated circuits, computer
processing units and semiconductor-production machinery. None isolates AI, HBM,
EUV scanners or EUV components. Exporter-reported FOB values are used; mirror
imports are not added. Original HS edition is retained on every point.

Eight additional material categories have verified HS definitions in the WCO
2012, 2017 and 2022 editions:

| Code | Material | Scope |
| --- | --- | --- |
| 280461 | Silicon ≥99.99% | Includes solar feedstock; this threshold does not isolate chip-grade silicon |
| 284920 | Silicon carbide | Compound feedstock; not finished wafers or ceramic EUV components |
| 281820 | Alumina | Excludes artificial corundum; includes broad industrial uses |
| 690912 | Technical ceramics, Mohs ≥9 | Hard technical wares; not all advanced ceramics or only semiconductor components |
| 690919 | Other technical ceramics | Other laboratory/chemical/technical wares within 6909.1; excludes 690912 |
| 281122 | Silicon dioxide | Chemical silica, not natural quartz or finished low-expansion optical glass |
| 800110 | Unwrought unalloyed tin | Includes non-EUV industrial uses; no EUV-grade purity split |
| 8102 | Molybdenum and articles | Includes waste and scrap; not only EUV mirror-coating material |

Material definitions, manufacturer application examples and source links live in
`aidash/catalogs/material-commodities.json`. Material categories span different
production stages and cannot be summed as a chip/EUV-input total. The interface
groups them under Materials in the product selector and explains their uses.

The expanded pilot includes 1,216 measured routes and 7,200 annual observations
among 12 selected reporting economies and areas. It is neither world trade
coverage nor a supplier/customer relationship map. Major material producers
outside this original selection are not covered. The three initial chip/equipment
categories have all 12 reporters through 2023; 2024 omits Viet Nam and 2025 omits
China, Other Asia nes and Viet Nam. Material availability also varies by product:
for example, silicon has 10/12 reporters in 2024 while SiC has 11/12.
The UI calculates coverage separately for each selected product and year and
shows unavailable readings for missing years. No cross-year world total is
calculated. A successful download can still contain explicitly incomplete
reporter coverage.

The map shows the eight largest measured matching routes plus the selected route.
Arrows point from exporter to destination. Edge annotations show USD values;
selecting or hovering a route adds the full origin/destination and reference year.
Labels and lines are clickable, and an expandable route list provides the same
annotations as keyboard-accessible buttons. Reciprocal routes are separated by
a small fixed screen offset. Line thickness highlights selection, not volume.
The trade globe supports 1×–5× zoom using the visible buttons, mouse wheel,
two-finger pinch, or +/- keys; 0 resets zoom. Drag and arrow keys rotate the globe.
Area code 490 remains **Other Asia, nes**. Its representative marker near Taiwan
does not relabel the full aggregate as exclusively Taiwan.

## EUV relationships and events

The EUV view opens with an interactive vector cutaway of the scanner. It depicts
the external CO₂ drive laser, tin-plasma source/collector, illumination and
projection mirrors, reflective mask, pellicle, wafer clamp/stage and vacuum
valves. ASML integration is linked to the machine enclosure; TSMC output sits
outside it as a downstream fab relationship. The optical path is representative,
not an exact physical layout or mirror count. It reflects off the mask and passes
through the protective pellicle on both the incoming and outgoing path.

Nine selectable diagram parts retain access to all eleven existing supplier/site
records. Where a component has multiple locations, the location selector chooses
the associated record. Diagram controls support Tab, Enter and Space; mobile
also provides a component selector. Component selection updates the existing
history, evidence and event panels. The former supplier card grid is removed.

The drawing follows the ASML EUV system overview and ZEISS optical-path explainer
linked beside the figure. Masks/pellicles are fab consumables, VAT is explicitly
an application association, and companywide histories do not measure site output.

The component view links optics, drive lasers, source components and clamps to
ASML, then to a documented fab customer. VAT has documented EUV applications but
no assumed named ASML supply relationship. Masks and pellicles are fab consumables.
The ASML–Mitsui relationship is a license, not a measured goods flow.

Announcements, construction and completed events retain separate statuses.
Passing a planned completion date does not make a project completed. Year-only
dates are not assigned an invented month; current-year records with unspecified
months appear separately from the monthly event list.

The top month and local sliders limit observation dates. Charts use the latest
ingested versions, not historical release vintages. Missing periods break lines,
and annual observations enter only at their recorded year/fiscal-year end.

## Verification

```bash
python3 -B -m unittest discover -s tests
node tests/dashboard_ui.mjs
node tests/activity_ui.mjs
node tests/globe.mjs
```

The activity UI integration test requires the built local dashboard dataset
(`dist/data/dashboard.json`, git-ignored); prepare it before running this test.
Its September 2026 coverage expectations may need review after source backfills.
It checks diagram-part
selection, supplier-location coverage, removed navigation, history rendering,
missing reporter years, fiscal labels, currency units and date filtering.
Globe checks run the actual geographic code against
a drawing sink, without browser inspection.
