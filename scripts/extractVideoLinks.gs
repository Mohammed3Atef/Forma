/**
 * Google Apps Script — extract the *real* video hyperlinks from the coaching
 * sheet and output them as JSON for the Gym Tracker app's Import screen.
 *
 * WHY: the video cells display the text "فيديو الشرح" with the URL stored as an
 * inserted hyperlink. CSV/HTML exports strip these hrefs, so they must be read
 * via the Sheets rich-text API — which is exactly what this script does.
 *
 * HOW TO USE
 *  1. Open the Google Sheet → Extensions → Apps Script.
 *  2. Paste this file, set SHEET_NAME / NAME_COL / LINK_COL to match your sheet.
 *  3. Run `extractVideoLinks` once (authorise when prompted).
 *  4. Copy the JSON from View → Logs (or the returned popup) and paste it into
 *     the app: Settings → Import data.
 *
 * Output shape:  [{ "name": "<exercise name>", "url": "https://..." }, ...]
 */

// --- CONFIG (adjust to your sheet) -----------------------------------------
var SHEET_NAME = 'Training';   // the tab that holds the workout table
var NAME_COL = 2;              // 1-based column index of the exercise name
var LINK_COL = 11;             // 1-based column index of the "فيديو الشرح" link
var FIRST_ROW = 2;             // first data row (skip headers)
// ---------------------------------------------------------------------------

function extractVideoLinks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);

  var lastRow = sheet.getLastRow();
  var out = [];

  for (var row = FIRST_ROW; row <= lastRow; row++) {
    var nameCell = sheet.getRange(row, NAME_COL);
    var linkCell = sheet.getRange(row, LINK_COL);
    var name = String(nameCell.getValue()).trim();
    if (!name) continue;

    // 1) Whole-cell link.
    var url = linkCell.getRichTextValue() ? linkCell.getRichTextValue().getLinkUrl() : null;

    // 2) Link embedded in a text run inside the cell.
    if (!url) {
      var rich = linkCell.getRichTextValue();
      if (rich) {
        var runs = rich.getRuns();
        for (var i = 0; i < runs.length; i++) {
          var u = runs[i].getLinkUrl();
          if (u) { url = u; break; }
        }
      }
    }

    if (url) out.push({ name: name, url: url });
  }

  var json = JSON.stringify(out, null, 2);
  Logger.log(json);
  try {
    SpreadsheetApp.getUi().alert('Copy this JSON into the app (Import):\n\n' + json);
  } catch (e) {
    // Running without UI (e.g. from the editor) — JSON is in the logs.
  }
  return json;
}
