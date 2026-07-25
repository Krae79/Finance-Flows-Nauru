// Finance Flows Dashboard Nauru — live data source configuration.
//
// Paste a Google Sheets "publish to web" CSV link below to make this dashboard read
// live data from a shared Google Sheet, so a client team can edit the sheet and see
// it reflected here on refresh — instead of the bundled data/projects.csv snapshot.
//
// How to get the link (see README.md for the full walkthrough):
//   1. Open "Nauru Project Master List.xlsx" in Google Sheets (upload it, or open
//      with Google Sheets from Google Drive).
//   2. In Google Sheets: File > Share > Publish to web.
//   3. Under "Link", choose the specific sheet/tab that holds the combined project
//      rows (not "Entire document"), and choose "Comma-separated values (.csv)" as
//      the format.
//   4. Click "Publish", confirm, then copy the generated link.
//   5. Paste that link between the quotes below.
//
// Leave this empty ("") to fall back to the bundled data/projects.csv file (and, if
// that can't be fetched either — e.g. opening this folder directly from disk instead
// of a web server — the embedded snapshot in data/fallback-data.js).
window.NAURU_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQcjTTk5Pg2MqL2Nd1vDOX-AHDT_A0Ii4LYOO-oUCZb5dodtVJ5McJWJ6ru_pSv0McZoqUJFFedwRDn/pub?gid=1674094084&single=true&output=csv";
