# Nauru Past & Future Climate Finance Dashboard

A self-contained, single-page dashboard prepared for Nauru's Minister of
Finance and senior officials. It compares two tracks:

- **Commonwealth Tracker (Past)**, 85 historical climate finance projects
  and activities, spanning 1996 to 2031 (start/end years), verified capital
  $675.08M.
- **RONAdapt II Pipeline (Future)**, 397 costed, phased line items across
  21 named priority activities, transcribed from *RONAdapt II* (Government
  of the Republic of Nauru), verified capital $252.87M.

Combined across both tracks, $927.95M.

It has eight tabs: Executive Summary, Commonwealth Tracker (Past), RONAdapt
II Priorities (Future), Money Flow and Gaps, Sectors, Duplicates, Hazards &
Outcomes and Past vs Future Insights. The first three tabs each analyse
their own track (Executive Summary is the combined opening page); the rest
compare or combine both tracks.

**Everything on the page is computed in the browser from the rows in
`data/projects.csv`.** Nothing is pre-baked: sector totals, partner totals,
KPIs, the sector categorisation, the gap labels on the Money Flow and Gaps
tab and the duplicate check are all recalculated from the currently loaded
rows every time the page loads, with one deliberate exception: the seven
findings on the Past vs Future Insights tab are fixed prose, written and
verified against the data separately, not recomputed live (see "The
Insights tab" below).

There is no build step and no external dependency (no CDN, no npm
package). It is vanilla HTML/CSS/JS and works opened directly from disk or
served from any static host.

This dashboard is a companion piece to the `finance-flows-nauru` dashboard
(a separate, already-shipped project) and deliberately reuses its visual
language, chart helpers and CSS conventions, but it is a fully separate
site with its own data file and its own comparison logic. It does not
share files with, or modify, that other project.

## Files

```
nauru-past-future-dashboard/
├── index.html                                the app shell (markup + styles)
├── app.js                                    all application logic (CSV parsing, aggregation, rendering)
├── config.js                                 live Google Sheet link, empty by default, see "Live editing" below
├── data/
│   ├── projects.csv                          the bundled data snapshot (482 rows)
│   └── fallback-data.js                      the same CSV embedded as a JS string, for file:// use
├── Nauru_Past_Future_Projects_Unified.xlsx   ready-to-publish workbook, same 482 rows, for live editing
└── README.md                                 this file
```

## Opening it locally

Because the page fetches `data/projects.csv` with `fetch()`, opening
`index.html` directly by double-clicking it (a `file://` URL) will usually
be blocked by the browser's CORS rules for local file reads. Two ways
around that:

**Just double-click it anyway.** The page falls back automatically to the
data embedded in `data/fallback-data.js` if the CSV fetch fails, so it
will still work, you just won't be exercising the CSV-fetch path.

**Or serve the folder**, which exercises the same code path a static host
uses:

```bash
cd nauru-past-future-dashboard
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

Any static file server works equally well (`npx serve`, VS Code's Live
Server extension, etc).

## Deploying this to a website

The folder is entirely static, HTML, CSS and JavaScript, no server or
build step, so any static host works. Two straightforward options.

**GitHub Pages** (matches how the original Finance Flows Dashboard is
hosted). If you have edit access to a GitHub repository already set up for
Pages, open each file in the GitHub web interface and use "Upload files"
(for `Nauru_Past_Future_Projects_Unified.xlsx` and anything under `data/`)
or "Add file > Create new file" and paste the contents (for `index.html`,
`app.js`, `config.js`, `README.md`). Commit to the branch Pages serves
from. The site becomes available at
`https://<your-github-username>.github.io/<repository-name>/` a minute or
two after the commit. If you would like a dedicated repository set up for
this dashboard rather than folded into an existing one, that is a small
one-off task, ask and it can be prepared for you to upload into.

**Netlify Drop**, no account or git required. Go to
[app.netlify.com/drop](https://app.netlify.com/drop) and drag the whole
`nauru-past-future-dashboard` folder onto the page. Netlify serves it
immediately at a generated `https://<random-name>.netlify.app` address.
This is the fastest way to get a shareable link, useful for a quick
circulation ahead of a meeting, though the link is less durable than a
GitHub Pages site tied to a repository you control.

Either way, once deployed, reloading the live page always re-fetches
`config.js` and `data/projects.csv` fresh (or the live Google Sheet, once
set up, see below), so publishing once and then updating the data
afterwards does not require redeploying the site.

## Live editing, connecting the dashboard to a spreadsheet

By default the dashboard reads its 482 rows from the bundled
`data/projects.csv` snapshot. To let data be added or corrected directly
in Excel or Google Sheets and have it appear on the live site on refresh,
without re-uploading any files, point it at a published Google Sheet
instead.

This dashboard's rows are not a plain copy of either tab in the original
Nauru Project Master List workbook. Building it involved combining the
Commonwealth Tracker tab (6 columns) and the RONAdapt II priorities tab
(15 columns, with numbered program header rows and lettered cost-item
rows) into one unified 21-column schema, and computing several fields
along the way, a normalised Sector, a Hazard Group, a Phase, and, for the
Commonwealth Tracker, a Status derived from the project's end year. That
normalisation is Python logic run once to build the dataset, not a Google
Sheets formula, so the live sheet needs to already be in the unified
schema. `Nauru_Past_Future_Projects_Unified.xlsx`, included in this
folder, is exactly that, all 482 current rows, already in the schema the
dashboard reads, ready to publish and edit going forward.

1. Upload `Nauru_Past_Future_Projects_Unified.xlsx` to Google Drive and
   open it with Google Sheets (right-click the file, "Open with", "Google
   Sheets").
2. Add new rows, or correct existing ones, directly in the "Projects"
   sheet. Keep the header row exactly as it is, the dashboard matches
   columns by name, not position. For a new row, follow the pattern of an
   existing row on the same track for Sector, Hazard Group and Phase, or
   leave them blank and fill them in once you have decided the right
   category.
3. In Google Sheets, **File > Share > Publish to web**.
4. Under "Link", choose the **Projects** sheet specifically (not "Entire
   document"), and choose **Comma-separated values (.csv)** as the format.
5. Click **Publish**, confirm, then copy the generated link.
6. Paste that link into `config.js`, between the quotes after
   `window.NAURU_PF_SHEET_CSV_URL =`, and redeploy (or, for GitHub Pages,
   edit and commit just that one file, this does not require touching any
   other file).
7. Reload the live page. The banner under the header will read "Data
   loaded from Google Sheet (live)" and show the row count, confirming it
   is reading the sheet rather than the bundled snapshot. From then on,
   any edit made in the sheet appears on the dashboard the next time it is
   loaded, no further file uploads needed.

If the sheet is ever unreachable, unpublished, or returns something the
dashboard cannot parse, it falls back automatically to the bundled
`data/projects.csv`, and if that also fails (for example when opening the
file directly from disk rather than a web server), to the embedded
snapshot in `data/fallback-data.js`. The banner always names which of the
three it used.

**If you change the underlying figures, re-check the Past vs Future
Insights tab.** Its seven findings on the final tab are fixed prose (see
below), written against the figures at the time this dashboard was built.
Editing the sheet alone will not update the specific numbers quoted there.
Recompute them and edit the `findings` array in `renderInsightsTab()` in
`app.js`, then redeploy.

## Updating the data without a live sheet

If you would rather not set up the live Google Sheet connection, the
bundled snapshot can still be edited directly.

1. Edit `data/projects.csv` directly, keeping the exact header row this
   app expects (see "CSV schema" below).
2. Regenerate `data/fallback-data.js` from the updated CSV. It is a single
   JS statement, `window.NAURU_PF_FALLBACK_CSV = "...";`, with the CSV
   text escaped as a JS string (backslashes and double quotes escaped,
   line breaks turned into `\n`). A short Python one-off:
   ```python
   with open('data/projects.csv', encoding='utf-8') as f:
       text = f.read()
   escaped = text.replace('\\', '\\\\').replace('"', '\\"').replace('\r\n', '\\n').replace('\n', '\\n')
   with open('data/fallback-data.js', 'w', encoding='utf-8') as f:
       f.write('window.NAURU_PF_FALLBACK_CSV = "' + escaped + '";\n')
   ```
3. Redeploy both files and reload the page. The banner under the header
   shows how many rows it found and where they came from (`local file
   (data/projects.csv)` or `embedded fallback (data/fallback-data.js)`).
4. As above, if the underlying figures change, re-check and update the
   Past vs Future Insights tab findings by hand.

## CSV schema

`data/projects.csv` has one header row and one row per project, activity,
or line item. Columns, in order:

| Column | Notes |
|---|---|
| `ID` | Short row identifier (e.g. `C01`, `R001`). Not otherwise used by the app. |
| `Track` | `Commonwealth Tracker (Past)` or `RONAdapt II Pipeline (Future)`. |
| `Program` | Future-track rows only, the RONAdapt II priority activity this line item rolls up into. Blank for past-track rows. |
| `Project Name` | |
| `Description` | Free text, blank for every row in the current dataset. |
| `Sector` | Normalised sector, one of the values shown on the Sectors tab. |
| `Location` | **Recorded as `TBC` for every row in the current dataset.** The app never infers or fabricates a location, see "Location and Lead Organisation" below. |
| `Lead Organisation` | Also `TBC` for every row currently. Same handling as `Location`. |
| `Financial Instrument` | e.g. Grant, Technical assistance. `TBC` for every future-track row currently. |
| `Funding Source (raw)` | Free text, identical to `Partners` for every row in the current dataset. Shown verbatim in the past track's project table. |
| `Partners` | Comma-separated list of named funding partners. Split, trimmed and filtered against a list of generic non-institution terms (see below) wherever the app ranks "who is funding it". |
| `Capital (AUD m)` | Numeric, in AUD millions, already at that scale for both tracks, never rescaled. |
| `Start Year` / `End Year` | Numeric years. Either may be blank. |
| `Phase` | Future-track rows only: `Phase 1 (Near-term)`, `Phase 2 (Medium-term)`, or `Phase 3 (Long-term)`. Blank for past-track rows. |
| `Status` | Past track: `Completed`, `Under implementation`, or `Ongoing, no end date recorded`. Future track: always `Proposed`. |
| `Funding Outcome` | Past track: always `Funded`. Future track: always `Unspecified`, the source data does not record funded/unfunded status for the pipeline, this is intentional and is stated plainly on the Hazards & Outcomes tab rather than charted as a single-category bar. |
| `Hazard Group` | One of the normalised hazard categories shown on the Hazards & Outcomes tab. |
| `Duplicate Status` | Blank for every row in the current dataset, see "Duplicates tab" below. |
| `Duplicate Of` | Free text, blank for every row currently. |
| `Notes` | Past-track rows carry the original free-text sectoral theme as recorded in the source, before normalisation into `Sector` (e.g. "Sectoral theme as recorded in source: Climate change, biodiversity, land degradation"). Shown as a hover tooltip on the project name in the Commonwealth Tracker (Past) tab's project table, so the normalisation stays visible rather than hidden. |

### Location and Lead Organisation

Every row in the current dataset has `Location = TBC` and
`Lead Organisation = TBC`. This genuinely was not available in the source
records, not a gap in this dashboard's processing. Rather than invent
placeholder locations, both track tabs render an explicit "Location data
not recorded for this dataset" panel instead of a map or geography chart.
If a future data refresh adds real location data, replace the
`not-available` panel markup in `index.html` (`#tab-past` and
`#tab-future`, the "Where, geographically" panels) with a chart, and wire
it up in `app.js` the same way the sector and hazard charts are.

### Partner name handling

`Partners` (identical to `Funding Source (raw)` in the current data) is
split on commas and trimmed. For the "who is funding it" charts and
tables, tokens that are generic, non-institution values rather than named
partners are excluded. The exact list is the `GENERIC_PARTNER_TERMS` set
near the top of `app.js`; it covers the values named in the brief
(`Mixed`, `Mixed donors & GoN`, `RON Gov`, the split halves of `RON Gov
Co-finance, Donor Overheads`, blank) plus a small number of other clearly
generic terms found in the raw data during development (`Bilateral`,
`Multilateral`, `Private Sector`, `NGOs`, `Universities`, bare
`Government` and similar). None of these exclusions change any of the
brief's verified top-partner figures, they only keep low-value generic
tokens out of the full partner list and the "who is funding it" charts.
Partner name variants are **not** merged (e.g. `ADB` and `ADB TA grant`
are kept as distinct tokens), matching how the underlying figures were
verified.

### The Insights tab

The Past vs Future Insights tab (`#tab-insights`) is the one tab whose
content is not recomputed live. Its seven findings were written and
verified against `data/projects.csv` separately (see the brief this
dashboard was built from) and are inserted as fixed HTML strings in
`renderInsightsTab()` in `app.js`. If the underlying data changes
materially, these findings need to be re-verified and edited by hand,
reloading the page will not update them automatically the way every other
tab does.

### Money Flow and Gaps: gap labels

The "Where the gaps are" table on the Money Flow and Gaps tab computes one
of four labels per sector from `past` and `future` capital:

- **No RONAdapt II proposal**: past capital is greater than zero, future
  capital is zero.
- **New priority**: future capital is greater than zero, past capital is
  zero.
- **Broadly continued**: both tracks carry capital and future capital is
  at least 40 percent of past capital.
- **Largely wound down**: both tracks carry capital but future capital is
  under 40 percent of past capital.

### Sectors tab: categorisation logic

The Sectors tab sorts every sector that appears in either track into one
of five rule-based groups, computed fresh from `past` and `future` capital
per sector (see `classifySectorBucket()` in `app.js`):

1. **Entirely new to the future pipeline**: past capital is exactly zero,
   future capital is greater than zero. No historical precedent at all.
   Health falls here (zero past capital, $10.46M in the pipeline).
2. **No future pipeline proposal**: future capital is exactly zero, past
   capital is greater than zero. Present in the historical record with no
   RONAdapt II proposal at all.
3. **Materially higher future than past**: both tracks carry capital, and
   future capital is at least 1.5 times past capital.
4. **Materially higher past than future**: both tracks carry capital, and
   future capital is 67 percent or less of past capital.
5. **Broadly continued at similar scale**: both tracks carry capital, and
   neither of the two thresholds above is met.

This is a finer five-way split than the four-label gap table on the Money
Flow and Gaps tab (which only distinguishes "broadly continued" from
"largely wound down" for sectors present in both tracks, at a 40 percent
threshold). Both are rule-based and computed from the same two numbers per
sector, they just group the "both tracks present" case at different
granularity for different purposes: a plain gap flag in one table, a
five-way categorisation in the other.

### Duplicates tab

Every row's `Duplicate Status` is blank in the current dataset, so this
tab states plainly that a name-matching check between the two tracks
(85 Commonwealth Tracker project names against 397 RONAdapt II program and
sub-project names) found no match, and therefore no confirmed duplicate.
It also discloses the check's limitation explicitly: it compares names
only, not amounts or themes, so it cannot detect the same underlying work
recorded twice under different names or at different levels of
granularity. If a future data refresh flags a row with a
`Duplicate Status` value, extend `renderDuplicatesTab()` in `app.js` to
surface it (the reference `finance-flows-nauru` dashboard's Duplicates tab
shows one pattern for this, grouping confirmed and possible overlaps into
separate tables).

## Testing this app

There is no test suite bundled (this is a static page), but before
shipping a change, sanity-check:

1. Serve the folder locally (`python3 -m http.server`) and open it.
2. Confirm the status banner reports 482 rows and no console errors
   appear.
3. Click through all eight tabs and confirm the URL hash updates
   (`#summary`, `#past`, `#future`, `#flows`, `#sectors`, `#duplicates`,
   `#hazards`, `#insights`) and the right content shows.
4. Check the Executive Summary tab's headline figures against the
   verified figures in the brief this dashboard was built from
   ($675.08M past, $252.87M future, $927.95M combined, 85 past projects,
   397 future line items).
5. On the Commonwealth Tracker (Past) tab, try the search box and the
   sector/status filters on the full project table, and click a column
   heading to sort.
6. On the RONAdapt II Priorities (Future) tab, click a row in the "By
   priority activity" table to expand its costed sub-projects.
7. Toggle your OS or browser dark mode and confirm the page re-themes
   without any hardcoded-light-color artifacts.
