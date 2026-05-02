// ============================================================
//  BUDGET PWA — Google Apps Script (CORS-safe version)
//  All requests use GET to avoid CORS preflight issues.
//
//  SETUP:
//  1. Paste this into Apps Script editor
//  2. Deploy > New deployment > Web app
//  3. Execute as: Me
//  4. Who has access: Only myself
//  5. Copy the Web App URL into your Budget app
// ============================================================

const SHEET_NAME = 'Expenses';
const HEADERS    = ['ID', 'Title', 'Amount', 'Category', 'Date', 'Synced At'];

// ── ALL REQUESTS COME IN AS GET ──────────────────────────────
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;

    if (action === 'push') {
      const raw      = e.parameter.data || '[]';
      const expenses = JSON.parse(decodeURIComponent(raw));
      return push(expenses);
    }

    if (action === 'pull') {
      return pull();
    }

    // Health check
    return jsonResponse({ status: 'ok', message: 'Budget PWA Sync API is running.' });

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// ── PUSH: Write all expenses to the sheet ────────────────────
function push(expenses) {
  const sheet = getOrCreateSheet();

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }

  if (expenses.length > 0) {
    const now  = new Date().toISOString();
    const rows = expenses.map(e => [
      e.id       || '',
      e.title    || '',
      Number(e.amount) || 0,
      e.category || '',
      e.date     || '',
      now,
    ]);
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }

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
    .filter(r => r[0])
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
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  if (sheet.getRange(1, 1).getValue() !== 'ID') {
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setValues([HEADERS]);
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
