// ============================================================
//  BUDGET PWA — Google Apps Script
//  Receives POST requests (Content-Type: text/plain).
//  Single sheet, column G = "Archived" flag.
//
//  SETUP:
//  1. Paste this into Apps Script editor
//  2. Deploy > New deployment > Web app
//  3. Execute as: Me  |  Who has access: Anyone
//  4. Copy the Web App URL into your Budget app
// ============================================================

const SHEET_NAME = 'Expenses';
const HEADERS    = ['ID', 'Title', 'Amount', 'Category', 'Date', 'Synced At', 'Archived'];

// Health check via GET
function doGet(e) {
  return jsonResponse({ status: 'ok', message: 'Budget PWA Sync API running.' });
}

// All sync operations come in as POST
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action || '';

    if (action === 'pushActive')   return pushRows(body, '');
    if (action === 'pushArchived') return pushRows(body, 'yes');
    if (action === 'pull')         return pull();

    return jsonResponse({ status: 'error', message: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// ── PUSH ROWS ─────────────────────────────────────────────────
// replace=1 on the first chunk → wipe existing rows of this type, then write
// replace=0 on subsequent chunks → just append
function pushRows(body, archivedFlag) {
  const rows    = body.data    || [];
  const replace = body.replace === '1';
  const sheet   = getOrCreateSheet();
  const now     = new Date().toISOString();

  if (replace) {
    deleteRowsByFlag(sheet, archivedFlag);
  }

  if (rows.length > 0) {
    const newRows = rows.map(r => [
      r.id       || '',
      r.title    || '',
      Number(r.amount) || 0,
      r.category || '',
      r.date     || '',
      now,
      archivedFlag,
    ]);
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, newRows.length, HEADERS.length).setValues(newRows);
  }

  sheet.autoResizeColumns(1, HEADERS.length);
  return jsonResponse({ status: 'ok', written: rows.length, type: archivedFlag || 'active' });
}

// Delete all rows where column G matches the flag
function deleteRowsByFlag(sheet, flag) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    const rowFlag       = String(data[i][6]).toLowerCase();
    const matchesActive   = flag === ''    && rowFlag !== 'yes';
    const matchesArchived = flag === 'yes' && rowFlag === 'yes';
    if (matchesActive || matchesArchived) {
      sheet.deleteRow(i + 2);
    }
  }
}

// ── PULL ──────────────────────────────────────────────────────
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

// ── HELPERS ───────────────────────────────────────────────────
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
