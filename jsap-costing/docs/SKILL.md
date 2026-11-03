---
name: "jsap-activity-costing"
description: "Cost JSAP or NAP adaptation activities and sub-activities from past JSAPs, IDPs and other Pacific plans, escalate to current USD, scale to the State, and write into the JSAP Costing Workbook."
---

# JSAP activity costing agent

Use this skill whenever the user asks to cost, benchmark, justify or check CAPEX or OPEX for JSAP or NAP activity packages (FSM project PZ1019 or any similar Pacific adaptation plan), or to explain, audit or extend an existing costing.

The agent finds the closest costed example for every sub-activity, interprets whether it is a direct match or an analogue, escalates it to the current price year, scales it to the target State, and records every number with a traceable source, worked example and assumption.

## Inputs to gather first

1. The live JSAP Costing Workbook (always work on the latest version the user provides; never overwrite other people's rows).
2. The packages and activities assigned (for example Chuuk Activities 3 and 4).
3. Step 1 source: the previous JSAP for that State (costing appendix, usually Appendix D, financial plus in-kind totals).
4. Step 2 source: the State Infrastructure Development Plan (IDP), candidate project list and pipeline tables.
5. Any team method notes (for example the NAP Investment Strategy methodology section) and existing OPEX rules in the workbook.

If a file the user names is on SharePoint and cannot be reached, ask the user to save a copy into a connected folder. Do not guess its content.

## Step 0: read the workbook

- List sheets, headers and the rows for the assigned activities (activity rows have no sub-activity number; sub-activity rows do).
- Note conventions: font, accounting number format, grey cells marking non-input cells, which columns are CAPEX activity, CAPEX sub-activity, justification, OPEX, JSAP Cost, IDP Cost, Other source, and flag columns (International consultants, Constructing, Workshop/Training).
- Check for existing placeholder values. If a justification does not match its activity (for example a mangrove activity justified with waste facilities), treat it as a placeholder, replace it and record the old value in a change log tab.
- Check for external links ([1] in formulas) and remove them by pointing formulas to tabs inside the workbook.

## Step 1: extract the sources to text

- PDFs: `pdftotext -layout`; DOCX: pandoc; XLSX: openpyxl.
- Find the costing appendix with grep for `Sub Total`, `TOTAL`, `Objective`, `$`.
- Record the plan's development date to set its price year (for example the Chuuk JSAP file named 2015 was developed April 2016; price year 2016).
- Note internal inconsistencies (summary table versus appendix, line items versus stated subtotal) and state which figure is used.

## Step 2: match each sub-activity (strict source order)

For each sub-activity, in this order:

1. **Past JSAP of the same State.** Use a line that is the same or similar. Prefer the specific sub-action line over the objective total. Split objective lines across sub-activities where they clearly map (for example feasibility study line to the assessment sub-activity, implementation line to the facility sub-activity).
2. **IDP.** Use a candidate or pipeline project only when Step 1 has nothing. Record IDP projects that relate but are not used as cross-checks in the activity row (cell note or IDP column), not in the total.
3. **Other source.** In this order: other FSM State JSAPs (same SPC BSRP format, Appendix D), other Pacific JNAPs or national plans, then costed project documents in FSM or the Pacific (Adaptation Fund, GCF, PACC, ADB, World Bank). Use web search and download PDFs; cite the URL.

Interpretation rules:

- Label each match as **Direct match** (same activity) or **Analogue** (similar type of cost, such as a statewide sector vulnerability assessment used for another sector). Say which in the justification.
- Assessment, planning, policy and monitoring sub-activities take the assessment or planning lines only. Do not pull construction, land purchase or transport lines into planning-scope sub-activities; note the exclusion.
- Conditional works (only where assessment justifies) are costed in full and flagged as conditional.
- Where a sub-activity is coordination only, or clearly covered by another sub-activity or package, set $0 and name where it is covered. Never count the same spend twice.
- Check other packages before adding IDP projects (for example lagoon docks and seawalls belong to maritime connectivity, schools and typhoon shelters belong to the preparedness and buildings packages).
- A reference cost may serve as a unit cost for more than one sub-activity; say so.

## Step 3: escalate to the price base

- FSM uses USD, so escalate with US CPI-U: factor = CPI price base / CPI of the source price year.
- Price base: the average of the latest available months of the current year (state the months and the date of the next release).
- Convert other currencies at the source-year annual average rate (FRED or OECD) before escalating.
- Reference CPI-U annual averages (BLS, 1982-84=100): 2012 229.594; 2015 237.017; 2016 240.007; 2017 245.120; 2020 258.811; 2021 270.970; 2023 304.702; 2024 313.689; 2025 321.943. 2026 Jan-Sep: 325.252, 326.785, 330.213, 333.020, 335.123, 333.952, 333.918, 334.980, 336.940 (average 332.243). Refresh these with a web lookup before use.
- NZD per USD 2016 annual average: 1.436526 (FRED CCUSMA02NZA618N).
- Note that CPI may understate Pacific construction cost growth.

## Step 4: scale to the target State

- **State-level items** (studies, plans, policies, databases, registers, legal reviews): no scaling.
- **Community programmes** (training, seedlings, nurseries, stock distribution, surveys across communities): scale by population ratio, target State / source State.
- **Site works and pilots**: multiply by a site count (for Chuuk, 5 regions: Northern Namoneas, Southern Namoneas, Faichuk, Mortlocks, Northwest).
- **Shares of larger budgets**: sector share (for example 1/6 of a multi-sector line), State share (1/4 of an FSM-wide line), or sub-action share.
- 2010 Census populations: FSM 102,843; Chuuk 48,654; Pohnpei 36,196; Yap 11,376; Kosrae 6,616.
- Every scale factor is an input cell with a stated basis.

## Step 5: OPEX

- Follow the team rule in the workbook (2% of CAPEX a year for programmes; 1 to 5% for infrastructure, use 3% unless told otherwise).
- Where a source gives an annual cost, enter it as OPEX, not CAPEX.
- Flag recurring activities (monitoring, maintenance, extension, enforcement, community management) and note where a source total over the plan period sits in CAPEX but is really recurring.

## Step 6: build the workbook

Use openpyxl, match the file's font and number formats, and keep everyone else's rows untouched.

1. **Cost basis tab** (`Cost basis Pkg X-Y`): assumptions block (CPI values, price base formula, populations, regions, FX, OPEX rates, sources) and one row per source line: sub-activity, step, source document, reference, item, original cost, currency, price year, escalation formula, FX formula, scale basis, scale formula, cost type (CAPEX or OPEX), estimate formula `=cost*escalation*FX*scale`, note. Blue font for inputs.
2. **State tab** (for example Chuuk): for each sub-activity write CAPEX sub-activity (number), justification (source type, document, reference, item, original cost and year, scaling, 2026 value, match type and notes), OPEX formula, OPEX justification, source amounts split into JSAP Cost, IDP Cost and Other source columns, and Yes flags. Activity rows: `=SUM()` of sub-activities for CAPEX, OPEX and each source column; justification summarising how many sub-activities came from each step; IDP cross-checks as cell notes.
3. **Worked examples tab**: activity header rows with totals, sub-activity subtotal rows, one row per source line linked to the cost basis tab, a Working column built with TEXT() (for example `$342,600 (2016) x 1.384 inflation = $474,262`), a Why this source column, and a Check column comparing each subtotal with the State tab (allow small rounding tolerance).
4. **Change log tab**: previous placeholder values replaced.

Run the xlsx skill's `recalc.py` and fix every error. Then verify independently in Python that each sub-activity equals the sum of its source lines and that activity totals equal the source column sums.

## Step 7: report back

Give the user, in plain words:

- Totals by package and by source (Past JSAP, IDP, Other source), and counts of sub-activities per step and covered elsewhere.
- One worked example.
- Points for the team: largest lines, low or implausible figures, source inconsistencies, benchmarks from outside FSM, assumptions to confirm.
- Sources list with links.

When asked, explain the process, list assumptions (method, price and currency, scaling, scope, OPEX, source data), list recurring activities with their CAPEX and OPEX, or identify which costs belong to other packages.

## Reference library (costed lines found useful, original prices)

- **Chuuk JSAP 2016 Appendix D** (2016 USD, financial plus in-kind): 1.1 shoreline protection $3,930,782 (1.1.2 vulnerability assessment $372,032; 1.1.4 community shoreline protection $1,740,317; 1.1.6 regulations $248,032; 1.1.7 annual benchmark inspection $740,463); 1.2.1 zoning laws $217,290; 1.2.2 building codes $229,790; 1.2.3 retrofit $11,042,463, risk assessment and designs $145,082; 1.3.1 inland infrastructure assessment and design $133,182, construction $10m; 1.5 typhoon-proof shelters $2,811,710; 1.6.1 MOU $32,130 and logistics $31,880; 1.6.2 post-disaster plans $122,220; 1.7.1 relocation risk assessment $379,240, consultations $903,139, policy $49,400; 2.1 mangroves $344,130; 2.2 mountain protection $13,720,350 (2.2.2 stabilisation $10,246,450); 2.4.1 farms to higher ground $267,425; 2.4.2 elevated gardens $351,000; 2.4.3 elevated taro beds $549,400; 2.4.4 planting materials $342,600; 2.4.5 coconut and banana $318,800; 2.4.6 coconut processing $2,074,800; 3.4.1 climate finance access $21,355; 4.1.3 catchments $443,153; 4.3.1 weather stations $86,695, spatial maps $60,000, data training $10,124.
- **Chuuk IDP 2025-2034 Vol. 2** (2024 USD): AF1 Agriculture Facilities $1.45m; AF2 Fishing Coop $0.35m; AF3 Uman Seawall and Pad $10m; CE1 Weno Climate Resilient Shoreline $1.49m; CE2 Typhoon-Proof Shelters $1.41m; CE3 Weno Shoreline Protection $2m; CE5 and CE6 lagoon docks and seawalls $30m and $5m; ED1 School Improvement $63m; MA3 CFTI $0.75m; MS1 Climate-Proofing Infrastructure $11.19m; S17 Compost Facility $0.1m; F11 Cold Storage $4.3m; F15 Floating Marina $12.8m.
- **Pohnpei JSAP 2016** (https://drupal.uts.edu.au/sites/default/files/2020-05/Pohnpei%20JSAP%202016.pdf): 4.1.1 crop feasibility $32,284, nurseries $59,970, seedlings $24,080, vegetable garden training $4,500; 4.1.2 aquaculture feasibility $26,900; 4.1.3 fish stock $43,715; 4.1.5 taro and breadfruit mills $168,560; 4.1.6 food preservation $89,407; 5.4.2 river health monitoring $1,000; 7.2 business environment $24,891.
- **Yap JSAP 2015** (https://drupal.uts.edu.au/sites/default/files/2020-05/Yap%20JSAP%202015.pdf): 3.1.1 data and GIS $40,985; 3.2.1 community NRM plans $75,712; 3.2.4 coastal defence modelling $88,269; 3.3.1 invasive species $34,500; 3.5.1 salt tolerant crops $40,532; 3.5.2 agroforestry training $12,692; 3.5.3 aquaculture assessment $21,169; 3.5.4 food preservation $100,192; 3.5.5 markets $28,330; 6.1.1 building code review $86,213.
- **Kosrae JSAP 2015** (https://www.uts.edu.au/sites/default/files/2020-05/Kosrae%20JSAP%202015.pdf): objective totals only, for example 3.4 shoreline management $169,907; 5.1 relocation strategy $161,928; 6.4 drainage $156,900.
- **Adaptation Fund MCT FSM proposal 2017** (https://adaptation-fund.org/wp-content/uploads/2018/01/5198MCTFSMProposaltoAFAugust7th2017FINAL-2.pdf): community eco-based adaptation grants average $40,000 each; enforcement and community workshops $60,000 FSM-wide.
- **GCF SAP020 FSM climate-resilient food security, 2021** (https://www.greenclimate.fund/sites/default/files/document/funding-proposal-sap020.pdf): Component 2 climate-smart agriculture $5.94m, Component 3 value chains $1.06m, FSM-wide; use as cross-check.
- **Palau PACC food security BCA, Nov 2012** (https://www.adaptation-undp.org/sites/default/files/resources/palau_pacc_cba_final_report.pdf): taro patch demonstration site $21,461; dikes and gates $22,500 a year; 30 m dike $6,300 to $9,600; waterway labour $6,720 per site.
- **Cook Islands JNAP II 2016-2020** (NZD): food security $5.4M; fisheries $4.3M; biodiversity $0.9M; integrated coastal management incl. reef monitoring $0.5M.

## Writing style for outputs

Australian English, plain and factual, no comma after 'and', bullets start with a capital and end with a full stop, sources listed with links. Say clearly where a figure is an analogue, an assumption or a benchmark from outside FSM.