# JSAP costing: instructions for Claude Code

This folder holds the FSM NAP (Haskoning project PZ1019) costing of the Chuuk JSAP activities, the method that produced it, the sources, and a brief for a dashboard. Read this file fully before doing anything.

## What is here

| Path | What it is |
|---|---|
| `data/source_mapping.csv` | **The source of truth.** One row per costed source line: sub-activity, step (1 Past JSAP, 2 IDP, 3 Other source), document, reference, item, original cost, currency, price year, scale key, cost type, note. |
| `data/covered_elsewhere.csv` | Sub-activities set to $0 because another sub-activity covers them (avoids double counting). |
| `data/not_costed.csv` | Sub-activities with no defensible source. They stay blank and yellow in the workbook. |
| `data/transfer_types.csv` | How each Chuuk line carries to other States: S same, P population factor, T sites factor, X State-specific. |
| `data/cost_type_flags.csv`, `data/documents.csv` | Workbook flag columns and document names. |
| `data/dashboard/*.json` | Computed numbers exported from the built workbook, ready for the dashboard. |
| `scripts/load_mapping.py` | Reads the CSVs. |
| `scripts/build_workbook.py` | Rebuilds the Chuuk tab and the Cost basis, Worked examples, State factors, Source check and Change log tabs inside the live workbook. |
| `scripts/verify.py` | Independent checks (source text, classification, recompute, tab checks). Must report `FAILURES: 0`. |
| `scripts/export_dashboard_data.py` | Writes `data/dashboard/*.json` from a built workbook (including unused JSAP 2016 lines and unit-cost reuse from the Source check tab). |
| `scripts/build_dashboard.py`, `dashboard/` | Builds `dashboard/index.html` (self-contained, offline) from `dashboard/template.html` and the JSON. |
| `workbook/` | `JSAP_Costing_Workbook_LIVE_input_2026-11-02.xlsx` (team's live file used as input) and `JSAP_Costing_Workbook.xlsx` (built output). |
| `sources/` and `sources/text/` | Source PDFs and their text extracts used by `verify.py`. |
| `docs/METHOD.md` | Method, assumptions and open decisions. |
| `docs/SKILL.md` | The reusable costing skill (method for other States). |

## Rebuild and check (always in this order)

```bash
pip install openpyxl
cd scripts
python build_workbook.py --input ../workbook/<live workbook>.xlsx --output ../workbook/JSAP_Costing_Workbook.xlsx
# recalculate formulas (LibreOffice headless) so cached values exist:
soffice --headless --convert-to xlsx --outdir ../workbook/recalc ../workbook/JSAP_Costing_Workbook.xlsx
python verify.py --workbook ../workbook/recalc/JSAP_Costing_Workbook.xlsx
python export_dashboard_data.py --workbook ../workbook/recalc/JSAP_Costing_Workbook.xlsx
python build_dashboard.py   # inlines data/dashboard/*.json into dashboard/template.html, writes dashboard/index.html
```

If the xlsx skill's `recalc.py` is available, use it instead of the soffice line. Never deliver while `verify.py` reports failures.

## Rules (do not change without the user's agreement)

1. **Source order:** Step 1 Chuuk JSAP 2016 Appendix D; Step 2 Chuuk IDP 2025-2034 Vol. 2; Step 3 other FSM State JSAPs, then other Pacific plans and costed projects.
2. **Truth over completeness.** If no defensible source exists, the sub-activity goes in `not_costed.csv` and stays blank and yellow. Never invent a figure. Label each costed line "Direct match." or "Analogue." in the note.
3. **Escalation:** US CPI-U, price base = average of available 2026 months (Jan-Sep 2026 = 332.243). Source price years: Chuuk and Pohnpei JSAP 2016, Yap and Kosrae 2015, IDP 2024, Palau PACC 2012, MCT 2017, Cook Islands 2016 (NZD at 1.436526 per USD).
4. **Scaling:** State-level items not scaled; community programmes by population (2010 Census: Chuuk 48,654, Pohnpei 36,196, Yap 11,376, Kosrae 6,616); site works by 5 Chuuk regions.
5. **IDP projects** count in full only where the project is itself adaptation or the NAP asks for it to be delivered. Development projects (hospital, runway, terminal, roads, electrification) are not added; their resilience share is blank.
6. **No double counting:** a Chuuk JSAP 2016 line costs one sub-activity only. Check with the Source check tab.
7. **OPEX:** 2% of CAPEX a year for programmes, 3% for infrastructure (team rule).
8. Work on the team's live workbook as input; only the Chuuk tab columns G to R and the added tabs are written. Never write formulas that link to another file.

## Dashboard brief

Build a single self-contained HTML dashboard (`dashboard/index.html`) that reads the JSON in `data/dashboard/` (inline the data in the HTML so it works offline). Audience: Haskoning team, then SPREP and the FSM Government. Purpose: show what the costing means and where it is uncertain.

**Style (Haskoning brand):** palette only navy `#002E4F`, green `#5CBD7D`, mint `#BDDECC`, tan `#FAF2E3`, light tint `#EFF7F3`, grey borders `#BCC8D1`, white background. Arial/Helvetica. Large bold navy title, section headings bold navy UPPERCASE with wide letter spacing. Haskoning logo top right if provided. Navy footer band. Neutral, factual labels; no negative or comparative wording. Australian English.

**Views:**

1. **Headline.** Chuuk CAPEX total, annual OPEX, number of sub-activities costed / covered elsewhere / not costed, FSM roll-up total. State clearly that totals are partial where items are not costed.
2. **By package and activity.** Stacked bars of CAPEX by source (Past JSAP, IDP, Other source) for the six packages; drill down to activities and sub-activities.
3. **Confidence and gaps.** Share of CAPEX that is direct match, analogue, covered elsewhere, not costed. Table of not-costed items with reasons, filterable by package. This is the most important view for the team.
4. **Largest lines.** Top 15 source lines by 2026 estimate, with document and reference, so reviewers check the biggest numbers first.
5. **State roll-up.** Chuuk, Kosrae, Pohnpei, Yap, FSM by activity; split of each Chuuk activity into same / population / sites / State-specific. Show that other-State totals are lower bounds.
6. **JSAP 2016 use.** By objective: 2016 total versus amount used, with reasons for unused lines (from the Source check tab).
7. **Method.** Short pyramid-structured explanation: the three-step source order, escalation, scaling, the formula `original cost x FX x CPI factor x scale = 2026 estimate`, and one worked example (3.2.1).

Interaction: package filter, search box for sub-activity text, hover tooltips with justification text. Must work at phone width.

Check the dashboard totals against the workbook (Chuuk CAPEX USD 139,091,663 as built on 3 Nov 2026) before delivering.
