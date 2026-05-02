// ============================================================
//  BUDGET PWA — Google Apps Script (GET-based, CORS-safe)
//  Uses GET requests only — no preflight, no CORS issues.
//  Single sheet with Archived column (col G).
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
    const action = (e && e.parameter && e.parameter.action) || '';

    if (action === 'push') {
      const expenses = JSON.parse(decodeURIComponent(e.parameter.data || '[]'));
      const archived = JSON.parse(decodeURIComponent(e.parameter.arch || '[]'));
      return pushAll(expenses, archived);
    }

    if (action === 'pull') {
      return pull();
    }

    return jsonResponse({ status: 'ok', message: 'Budget PWA Sync API running.' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// ── PUSH ALL ─────────────────────────────────────────────────
function pushAll(expenses, archived) {
  const sheet   = getOrCreateSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }

  const now  = new Date().toISOString();
  const rows = [
    ...expenses.map(e => rowFor(e, '',    now)),
    ...archived.map(e => rowFor(e, 'yes', now)),
  ];

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }

  // Force date column (col 5 = E) to plain text so Sheets won't convert it
  if (rows.length > 0) {
    sheet.getRange(2, 5, rows.length, 1).setNumberFormat('@STRING@');
  }
  sheet.autoResizeColumns(1, HEADERS.length);
  return jsonResponse({ status: 'ok', expenses: expenses.length, archived: archived.length });
}

function rowFor(e, archivedFlag, now) {
  // Store date as plain text by prepending apostrophe — prevents Sheets auto-converting to a date serial
  const dateStr = String(e.date || '').substring(0, 10);
  return [
    e.id       || '',
    e.title    || '',
    Number(e.amount) || 0,
    e.category || '',
    dateStr,
    now,
    archivedFlag,
  ];
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
    // Format date explicitly as YYYY-MM-DD string
    // Sheets may return date cells as Date objects — use Utilities to format safely
    let dateVal = r[4];
    if (dateVal instanceof Date) {
      dateVal = Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      dateVal = String(dateVal).substring(0, 10); // take first 10 chars: YYYY-MM-DD
    }
    const entry = {
      id:       String(r[0]),
      title:    String(r[1]),
      amount:   Number(r[2]),
      category: String(r[3]),
      date:     dateVal,
    };
    String(r[6]).toLowerCase() === 'yes'
      ? archived.push(entry)
      : expenses.push(entry);
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
