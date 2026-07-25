# Finance Flows Dashboard Nauru

A self-contained, single-page dashboard that tracks Nauru's climate-finance
investment picture across two tracks:

- **Existing / Committed** — 98 named projects, 2017–2026, multi-donor.
- **RONAdapt II Pipeline (Proposed)** — 397 costed, phased sub-projects across
  21 priority activities, transcribed from the *RONAdapt II* national
  adaptation plan (Government of the Republic of Nauru, 2025).

It has five tabs — Overview, Project Master List, Sectors, Duplicates, and
Hazards & Funding Outcomes — plus a small rule-based chatbot that answers
questions from whatever data is currently loaded.

**Everything on the page is computed in the browser from the rows in
`data/projects.csv`** (or from a live Google Sheet, see below). Nothing is
pre-baked: sector totals, partner totals, KPIs, the sector categorisation,
the duplicate-flag summary, the hazard/outcome matrix, and the chatbot's
answers are all recalculated from the currently loaded rows every time the
page loads. That's the point — edit the sheet, reload the page, the numbers
move.

There is no build step and no external dependency (no CDN, no npm package).
It is vanilla HTML/CSS/JS and works opened directly from disk or served from
any static host, including GitHub Pages.

## Files

```
nauru-dashboard/
├── index.html              the app shell (markup + styles)
├── app.js                  all application logic (CSV parsing, aggregation, rendering, chatbot)
├── config.js                Google Sheet CSV URL — edit this to point at a live sheet
├── data/
│   ├── projects.csv         the bundled data snapshot (495 rows)
│   └── fallback-data.js      the same CSV embedded as a JS string, for file:// use
└── README.md                 this file
```

`Nauru Project Master List.xlsx` — the original spreadsheet this data was
compiled from — is **not** stored inside this repo (the repo's `.gitignore`
deliberately excludes `*.xlsx`, to keep this repo scoped to the web app
only). It's supplied to you as a separate file alongside the repo. See
"Making the data live" below for what to do with it.

## Opening it locally

Because the page fetches `data/projects.csv` with `fetch()`, opening
`index.html` directly by double-clicking it (a `file://` URL) will usually
be blocked by the browser's CORS rules for local file reads. Two ways around
that:

**Just double-click it anyway.** The page falls back automatically to the
data embedded in `data/fallback-data.js` if the CSV fetch fails, so it will
still work — you just won't be testing the CSV-fetch path.

**Or serve the folder**, which exercises the same code path GitHub Pages
uses:

```bash
cd nauru-dashboard
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

Any static file server works equally well (`npx serve`, VS Code's Live
Server extension, etc).

## Making the data live: publishing the sheet

By default the dashboard reads the bundled `data/projects.csv` snapshot. To
make it read a Google Sheet instead — so a client-side team can edit rows in
their own copy and see the dashboard update on the next page reload — do
this:

1. **Get the data into Google Sheets.** Upload `Nauru Project Master List.xlsx`
   to Google Drive and open it with Google Sheets (or File → Import into an
   existing Sheet). Make sure the sheet/tab you'll publish has the exact
   header row this app expects (see "CSV schema" below) — the bundled
   `data/projects.csv` is the reference for the shape.
2. **Publish that tab to the web.** In Google Sheets: **File → Share →
   Publish to web**. Under "Link", choose the *specific sheet/tab* that
   holds the combined project rows (not "Entire document"), and choose
   **Comma-separated values (.csv)** as the format. Click **Publish** and
   confirm.
3. **Copy the generated link.** It looks like
   `https://docs.google.com/spreadsheets/d/e/.../pub?gid=...&single=true&output=csv`.
4. **Paste it into `config.js`**:
   ```js
   window.NAURU_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/.../pub?output=csv";
   ```
5. Reload the dashboard. The banner under the page header shows which
   source loaded (`Google Sheet (live)`, `local file (data/projects.csv)`,
   or `embedded fallback`) and how many rows it found.

**Fallback chain.** On every load, the app tries, in order:

1. The URL in `window.NAURU_SHEET_CSV_URL` (if non-empty) — with an 8-second
   timeout, so a slow or unreachable sheet doesn't hang the page.
2. `data/projects.csv`, fetched same-origin (works on GitHub Pages and any
   static host).
3. The CSV string embedded in `data/fallback-data.js` (works even opened
   via `file://`, since it's a `<script>` tag, not a fetch).

If you update the Google Sheet, nothing here needs to change — just reload
the page (there's also a "Reload data" link in the status banner). If you
want to refresh the bundled snapshot instead (e.g. before a commit), export
the sheet as CSV and overwrite `data/projects.csv`, then regenerate
`data/fallback-data.js` as a JS string assignment
(`window.NAURU_FALLBACK_CSV = "...";`) from the same CSV text.

## CSV schema

`data/projects.csv` has one header row and one row per project or
sub-project. Columns, in order:

| Column | Notes |
|---|---|
| `ID` | Short row identifier (e.g. `E01`, `P123`). Not otherwise used by the app. |
| `Track` | `Existing / Committed` or `RONAdapt II Pipeline (Proposed)`. |
| `Program` | Pipeline rows only — the RONAdapt II priority activity this sub-project rolls up into. Blank for existing-track rows. |
| `Project Name` | |
| `Description` | |
| `Sector` | One of 14 sectors (see the Sectors tab for the current list). |
| `Location` | Existing-track rows only, in practice — pipeline rows are costed nationally. |
| `Lead Organisation` | |
| `Financial Instrument` | e.g. Grant, Loan, Public Capital Expenditure. |
| `Funding Source (raw)` | Free-text as recorded in the source. |
| `Partners` | **Semicolon-separated** list of named funding partners. A blank field means no partner is named. |
| `Capital (AUD m)` | Numeric, in AUD millions. **Leave blank for unknown — do not enter 0.** The app never coerces a blank to zero; it's excluded from sums and counted separately where relevant (e.g. "$X named, Y line items with no capital recorded"). |
| `Start Year` / `End Year` | Numeric years. Either may be blank. |
| `Phase` | Pipeline rows only: `Phase 1 (Near-term)`, `Phase 2 (Medium-term)`, or `Phase 3 (Long-term)`. |
| `Status` | Free-text project status (e.g. Completed, Funded, Planned, Proposed…). |
| `Funding Outcome` | Normalised: `Funded`, `Seeking funding`, `Unsuccessful`, or `Unspecified`. Drives the Hazards & Funding Outcomes tab. |
| `Hazard (recorded)` | Free-text hazard as recorded in the source. |
| `Hazard Group` | Normalised into one of 10 categories (see "Hazard groups" below). Drives the Hazards tab. |
| `Hazard Source` | Where the hazard tag came from (e.g. "Recorded in source" vs. "Auto-tagged"). |
| `Duplicate Status` | See "Duplicate Status convention" below. |
| `Duplicate Of` | Free text pointing at the row this one plausibly overlaps with. |
| `Notes` | Free text. |

### Hazard groups

The 10 normalised values used in `Hazard Group`:

Coastal erosion & sea-level rise · Drought & water security · Climate-health
risks · Food insecurity · Energy & fuel security · Land & marine environment
· Multi-hazard preparedness · Enabling & capacity (cross-hazard) · Flooding
& storm surge · General climate resilience.

If you add rows, tag them with one of these exact strings so they group
correctly on the Hazards tab; anything else (or blank) falls into an
"Unclassified" bucket there.

### Duplicate Status convention

Some rows plausibly describe the same underlying spend recorded twice —
once as a rough placeholder in the existing/committed track, once in
RONAdapt II's later, more detailed costing (or two closely related site
upgrades). `Duplicate Status` records this with one of three values:

- *(blank)* — no known overlap.
- `Confirmed overlap - excluded from adjusted totals` — this row is
  excluded from the "adjusted combined total" figure shown on the Overview
  and Duplicates tabs (its capital still counts everywhere else — sector
  totals, the Project Master List, etc. — it's only removed from that one
  headline "adjusted" figure, to avoid double-counting the same money
  twice when adding the two tracks together).
- `Possible overlap - review` — flagged for a human to check, but **not**
  excluded from any total. Shown alongside the confirmed rows on the
  Duplicates tab so it doesn't get lost.

`Duplicate Of` should name the other row/programme it plausibly duplicates,
in free text (there's no ID cross-reference — the field is for a reader,
not for the app to resolve programmatically).

This is how the dashboard now handles the one case that used to be
hardcoded in an earlier build (a flagship relocation programme costed as a
$300m placeholder in one track and again, in detail, in RONAdapt II): it's
simply a row with `Duplicate Status = Confirmed overlap - excluded from
adjusted totals`, not a special case in the code. Flag any future duplicate
the same way and the dashboard (KPI cards, the Duplicates tab, and the
chatbot's "is anything double-counted?" answer) will pick it up
automatically.

## Sectors tab: categorisation logic

The Sectors tab sorts every sector into one of four buckets, using four
rules applied fresh to whatever's currently loaded (not a one-off editorial
judgement baked into the data):

1. **Gap / neglected** — existing/committed capital is *exactly zero*, but
   the RONAdapt II pipeline proposes capital for it. A genuine ask with no
   track record yet.
2. **Self-sustaining** — has existing/committed capital, but *zero*
   RONAdapt II pipeline ask. May not need further donor attention right
   now.
3. **Important** — none of the above, *and* the sector sits in the top half
   of all sectors by combined (existing + pipeline) capital, *and* it spans
   2 or more distinct `Hazard Group` values, *and* it names 2 or more
   distinct funding partners. The idea: a lot of money riding on more than
   one problem and more than one funder is worth watching even if it looks
   well-resourced, because "well-resourced" here means "several different
   institutions each partly committed", not "secured".
4. **Steady / mixed** — everything left over: has both existing and
   pipeline capital, but doesn't clear the bar for "Important".

Rules are checked in that order (gap, then self-sustaining, then important,
then mixed), so a sector can only land in one bucket. Because it's rule-based
rather than a fixed list, editing the sheet — adding a sector, moving
capital between tracks, adding a second hazard group to a sector — can move
a sector between buckets on the next reload.

## Testing this app

There's no test suite bundled (this is a static page), but before shipping
a change, sanity-check:

1. Serve the folder locally (`python3 -m http.server`) and open it.
2. Confirm the status banner reports the row count you expect and no
   console errors appear.
3. Click through all five tabs and confirm the URL hash updates
   (`#overview`, `#projects`, `#sectors`, `#duplicates`, `#hazards`) and
   the right content shows.
4. On the Project Master List tab, try a few filters and the search box,
   and switch to the Timeline view.
5. Open the chatbot (bottom-right) and ask it two or three questions.
6. If you changed `config.js`, temporarily point it at an unreachable URL
   and confirm the page still loads via the local-CSV/embedded fallback
   without breaking, then set it back.
