// ============================================================
//  BUDGET PWA — Google Apps Script
//  Paste this entire file into your Apps Script editor.
//  Deploy as a Web App (Execute as: Me, Access: Only myself)
// ============================================================

// The name of the sheet tab to use
const SHEET_NAME = 'Expenses';

// Column headers
const HEADERS = ['ID', 'Title', 'Amount', 'Category', 'Date', 'Synced At'];

// ── GET: Pull expenses from the sheet ────────────────────────
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;
    if (action === 'pull') {
      return pull();
    }
    return jsonResponse({ status: 'ok', message: 'Budget PWA Sync API running.' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// ── POST: Push expenses to the sheet ─────────────────────────
function doPost(e) {
  try {
    const body    = JSON.parse(e.postData.contents);
    const action  = body.action;

    if (action === 'push') {
      return push(body.expenses || []);
    }

    return jsonResponse({ status: 'error', message: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// ── PUSH: Write all expenses to the sheet ────────────────────
function push(expenses) {
  const sheet = getOrCreateSheet();

  // Clear existing data (keep header)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }

  // Write all expenses
  if (expenses.length > 0) {
    const now  = new Date().toISOString();
    const rows = expenses.map(e => [
      e.id,
      e.title,
      Number(e.amount),
      e.category,
      e.date,
      now,
    ]);
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }

  // Auto-resize columns for readability
  sheet.autoResizeColumns(1, HEADERS.length);

  return jsonResponse({ status: 'ok', pushed: expenses.length });
}

// ── PULL: Read all expenses from the sheet ───────────────────
function pull() {
  const sheet   = getOrCreateSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return jsonResponse({ status: 'ok', expenses: [] });
  }

  const rows     = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const expenses = rows
    .filter(r => r[0]) // skip empty rows
    .map(r => ({
      id:       String(r[0]),
      title:    String(r[1]),
      amount:   Number(r[2]),
      category: String(r[3]),
      date:     String(r[4]),
    }));

  return jsonResponse({ status: 'ok', expenses });
}

// ── HELPERS ──────────────────────────────────────────────────
function getOrCreateSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Ensure headers exist
  const firstCell = sheet.getRange(1, 1).getValue();
  if (firstCell !== 'ID') {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    // Style the header row
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#1a1428');
    headerRange.setFontColor('#f0c060');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
