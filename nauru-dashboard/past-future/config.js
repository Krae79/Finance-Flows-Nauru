// Nauru Past and Future Finance Dashboard, live data source configuration.
//
// Paste a Google Sheets "publish to web" CSV link below to make this dashboard read
// live data from a shared Google Sheet, so data can be added or corrected in Excel
// or Google Sheets and appear here on refresh, instead of the bundled
// data/projects.csv snapshot.
//
// This dashboard's rows are not a direct copy of either source tab in the master
// list workbook. Each row also carries fields this dashboard computes, a normalised
// Sector, a Hazard Group, a Phase and, for the Commonwealth Tracker, a Status. For
// live editing to work, those computed fields must be entered directly, there is no
// separate raw tab this dashboard reads and transforms live.
//
// A ready-to-publish workbook in exactly this layout, "Nauru_Past_Future_Projects_Unified.xlsx",
// is included alongside this dashboard, pre-filled with all 482 current rows. See
// README.md for the full walkthrough. In short:
//   1. Upload Nauru_Past_Future_Projects_Unified.xlsx to Google Drive and open it
//      with Google Sheets (or open it directly in Excel and use its own web publish
//      option if preferred).
//   2. Add new rows, or edit existing ones, directly in that sheet. Keep the column
//      headers in row 1 exactly as they are, the dashboard matches columns by name.
//   3. In Google Sheets: File > Share > Publish to web.
//   4. Under "Link", choose the sheet/tab that holds the project rows (not "Entire
//      document"), and choose "Comma-separated values (.csv)" as the format.
//   5. Click "Publish", confirm, then copy the generated link.
//   6. Paste that link between the quotes below.
//
// Leave this empty ("") to fall back to the bundled data/projects.csv file (and, if
// that can't be fetched either, e.g. opening this folder directly from disk instead
// of a web server, the embedded snapshot in data/fallback-data.js).
window.NAURU_PF_SHEET_CSV_URL = "";
