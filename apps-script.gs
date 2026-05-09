// ============================================================
//  BUDGET PWA — Google Apps Script (GET-based, CORS-safe)
//  Uses GET requests only — no preflight, no CORS issues.
//  Each calendar month gets its own sheet tab, e.g.
//  May_2026_Expenses, April_2026_Expenses, etc.
//
//  SETUP:
//  1. Paste this into Apps Script editor
//  2. Deploy > New deployment > Web app
//  3. Execute as: Me  |  Who has access: Anyone
//  4. Copy the Web App URL into your Budget app
// ============================================================

const HEADERS = ['ID', 'Title', 'Amount', 'Category', 'Date', 'Synced At', 'Archived'];

// Convert a YYYY-MM string to a sheet tab name, e.g. "2026-05" → "May_2026_Expenses"
function sheetNameForMonth(month) {
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
  if (!month) return 'Expenses'; // safety fallback
  const parts     = String(month).split('-');
  const year      = parts[0];
  const monthIdx  = parseInt(parts[1], 10) - 1;
  const monthName = MONTH_NAMES[monthIdx] || 'Unknown';
  return `${monthName}_${year}_Expenses`;
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    const month  = (e && e.parameter && e.parameter.month)  || '';

    if (action === 'upsert') {
      const expense      = JSON.parse(decodeURIComponent(e.parameter.expense || '{}'));
      const archivedFlag = e.parameter.archived || '';
      return upsertRow(expense, archivedFlag, month);
    }

    if (action === 'delete') {
      const id = e.parameter.id || '';
      return deleteRow(id, month);
    }

    if (action === 'clear') {
      return clearSheet(month);
    }

    if (action === 'pull') {
      return pull(month);
    }

    return jsonResponse({ status: 'ok', message: 'Budget PWA Sync API running.' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// ── PUSH ALL ─────────────────────────────────────────────────
function pushAll(expenses, archived, month) {
  const sheet   = getOrCreateSheet(month);
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
    // Force date column (col 5 = E) to plain text so Sheets won't convert it
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

// ── UPSERT ONE ROW ───────────────────────────────────────────
// Finds the row with matching ID and updates it; appends if not found.
function upsertRow(expense, archivedFlag, month) {
  const sheet   = getOrCreateSheet(month);
  const lastRow = sheet.getLastRow();
  const now     = new Date().toISOString();
  const id      = String(expense.id || '');
  const newRow  = rowFor(expense, archivedFlag, now);

  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) {
        const rowNum = i + 2;
        sheet.getRange(rowNum, 1, 1, HEADERS.length).setValues([newRow]);
        sheet.getRange(rowNum, 5, 1, 1).setNumberFormat('@STRING@');
        return jsonResponse({ status: 'ok', action: 'updated', id });
      }
    }
  }

  // Not found — append
  const appendAt = sheet.getLastRow() + 1;
  sheet.getRange(appendAt, 1, 1, HEADERS.length).setValues([newRow]);
  sheet.getRange(appendAt, 5, 1, 1).setNumberFormat('@STRING@');
  return jsonResponse({ status: 'ok', action: 'inserted', id });
}

// ── DELETE ONE ROW ───────────────────────────────────────────
// Removes the row whose ID matches. No-ops silently if not found.
function deleteRow(id, month) {
  const sheet   = getOrCreateSheet(month);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ status: 'ok', action: 'not_found' });

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  // Iterate in reverse so deleting a row doesn't shift subsequent indices
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return jsonResponse({ status: 'ok', action: 'deleted', id });
    }
  }
  return jsonResponse({ status: 'ok', action: 'not_found' });
}

// ── CLEAR SHEET ──────────────────────────────────────────────
// Removes all data rows from the month sheet (keeps header).
function clearSheet(month) {
  const sheet   = getOrCreateSheet(month);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }
  return jsonResponse({ status: 'ok', action: 'cleared' });
}

// ── PULL ─────────────────────────────────────────────────────
// Reads from the sheet for the given month (format: YYYY-MM).
// All rows in that sheet belong to that month, so no further filtering needed.
function pull(month) {
  const sheet   = getOrCreateSheet(month);
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
function getOrCreateSheet(month) {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = sheetNameForMonth(month);
  let   sheet     = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  if (sheet.getRange(1, 1).getValue() !== 'ID') {
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setValues([HEADERS]);
    headerRange.setBackground('#1a1428');
    headerRange.setFontColor('#f0c060');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush(); // ensure header is committed before getLastRow() is called by caller
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
