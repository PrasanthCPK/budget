// ============================================================
//  BUDGET PWA — Google Apps Script (with Archive support)
//  Single sheet stores both active and archived expenses.
//  Column 7 "Archived" = "" (active) or "yes" (archived).
//
//  SETUP:
//  1. Paste this into Apps Script editor
//  2. Deploy > New deployment > Web app
//  3. Execute as: Me  |  Who has access: Anyone
//  4. Copy the Web App URL into your Budget app
// ============================================================

const SHEET_NAME = 'Expenses';
const HEADERS    = ['ID', 'Title', 'Amount', 'Category', 'Date', 'Synced At', 'Archived'];

function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;
    if (action === 'push') {
      const expenses = JSON.parse(decodeURIComponent(e.parameter.data  || '[]'));
      const archived = JSON.parse(decodeURIComponent(e.parameter.arch  || '[]'));
      return push(expenses, archived);
    }
    if (action === 'pull') return pull();
    return jsonResponse({ status: 'ok', message: 'Budget PWA Sync API running.' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// ── PUSH ─────────────────────────────────────────────────────
function push(expenses, archived) {
  const sheet   = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }

  const now  = new Date().toISOString();
  const rows = [
    ...expenses.map(e => [e.id || '', e.title || '', Number(e.amount) || 0, e.category || '', e.date || '', now, '']),
    ...archived.map(e => [e.id || '', e.title || '', Number(e.amount) || 0, e.category || '', e.date || '', now, 'yes']),
  ];

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }

  sheet.autoResizeColumns(1, HEADERS.length);
  return jsonResponse({ status: 'ok', pushed: expenses.length, archived: archived.length });
}

// ── PULL ─────────────────────────────────────────────────────
function pull() {
  const sheet   = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return jsonResponse({ status: 'ok', expenses: [], archived: [] });
  }

  const rows     = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const expenses = [];
  const archived = [];

  rows.filter(r => r[0]).forEach(r => {
    const entry = {
      id:       String(r[0]),
      title:    String(r[1]),
      amount:   Number(r[2]),
      category: String(r[3]),
      date:     String(r[4]),
    };
    if (String(r[6]).toLowerCase() === 'yes') {
      archived.push(entry);
    } else {
      expenses.push(entry);
    }
  });

  return jsonResponse({ status: 'ok', expenses, archived });
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
