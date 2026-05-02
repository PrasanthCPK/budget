/* ============================================================
   BUDGET PWA v2 — App Logic
   Includes: Expenses, Stats, Export, Import, Sheets Sync
   ============================================================ */

'use strict';

// ── THEME ─────────────────────────────────────────────────────
function initTheme() {
  const saved = LS.get('budget_theme', 'dark');
  applyTheme(saved);
}

function applyTheme(mode) {
  const isLight = mode === 'light';
  document.body.classList.toggle('light', isLight);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = isLight ? '☀️' : '🌙';
  LS.set('budget_theme', mode);
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
}


// Normalise any date string to YYYY-MM-DD regardless of source format
// Handles: 'Sat May 02 2026 00:00:00 GMT+0530 (...)' and '2026-05-02' and '05/02/2026'
function normaliseDate(raw) {
  if (!raw) return todayStr();
  const s = String(raw).trim();

  // Already correct: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Try to extract YYYY-MM-DD directly from longer strings
  // e.g. 'Sat May 02 2026 00:00:00 GMT+0530 (India Standard Time)'
  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // Try parsing as a Date object and use UTC methods to avoid timezone shift
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    // Use UTC to avoid date shifting due to timezone offset
    const y   = d.getUTCFullYear();
    const m   = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return todayStr();
}

function todayStr() {
  const d   = new Date();
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Parse YYYY-MM-DD as local time (new Date('YYYY-MM-DD') is UTC on iOS — this fixes it)
function parseLocalDate(str) {
  const s = normaliseDate(str);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ── STORAGE HELPERS ──────────────────────────────────────────
const LS = {
  get: (k, fallback = null) => {
    try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ── STATE ────────────────────────────────────────────────────
let expenses        = LS.get('budget_expenses', []).map(e => ({ ...e, date: normaliseDate(e.date) }));
let selectedCat     = CATEGORIES[0].id;
let editingId       = null;  // null = adding new, string = editing existing

let activeMonth = todayStr().slice(0, 7);

// ── CURRENCY ─────────────────────────────────────────────────
const fmt = (n) => '₹' + Number(n).toFixed(2);

// ── FILTERS ──────────────────────────────────────────────────
function filterExpenses() {
  let list = [...expenses];
  if (activeMonth) list = list.filter(e => e.date.startsWith(activeMonth));
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

// ── RENDER: HEADER ───────────────────────────────────────────
function renderHeader() {
  const total = filterExpenses().reduce((s, e) => s + e.amount, 0);
  document.getElementById('totalDisplay').textContent = fmt(total);
  document.getElementById('monthLabel').textContent =
    new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ── RENDER: MONTH FILTER ─────────────────────────────────────
function renderMonthFilter() {
  const months = [...new Set(expenses.map(e => e.date.slice(0, 7)))].sort().reverse();
  const sel = document.getElementById('monthFilter');
  sel.innerHTML = '<option value="">All time</option>' + months.map(m => {
    const [y, mo] = m.split('-');
    const label = new Date(y, mo - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    return `<option value="${m}">${label}</option>`;
  }).join('');
  sel.value = activeMonth;
}

// ── RENDER: EXPENSE LIST ─────────────────────────────────────
function renderExpenses() {
  const list = filterExpenses();
  const container = document.getElementById('expenseList');
  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🪙</div>
      <p>No expenses here yet.<br/>Tap <strong>+</strong> to add one.</p></div>`;
    return;
  }
  const groups = {};
  for (const e of list) { if (!groups[e.date]) groups[e.date] = []; groups[e.date].push(e); }
  container.innerHTML = Object.entries(groups).map(([date, items]) => {
    const label = parseLocalDate(date)
      .toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
    return `<div class="date-group-label">${label}</div>` + items.map(e => {
      const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[8];
      return `<div class="expense-item" data-id="${e.id}">
        <div class="expense-emoji">${cat.emoji}</div>
        <div class="expense-info">
          <div class="expense-title">${escHtml(e.title)}</div>
          <div class="expense-cat">${cat.label}</div>
        </div>
        <div class="expense-right">
          <span class="expense-amount">${fmt(e.amount)}</span>
          <div class="item-actions">
            <button class="edit-btn" data-id="${e.id}" aria-label="Edit">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="delete-btn" data-id="${e.id}" aria-label="Delete">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
  }).join('');
  container.querySelectorAll('.delete-btn').forEach(btn =>
    btn.addEventListener('click', () => deleteExpense(btn.dataset.id)));
  container.querySelectorAll('.edit-btn').forEach(btn =>
    btn.addEventListener('click', () => openEditModal(btn.dataset.id)));
}

// ── RENDER: STATS ─────────────────────────────────────────────
function renderStats() {
  const list = filterExpenses();
  const total = list.reduce((s, e) => s + e.amount, 0);
  const count = list.length;
  document.getElementById('statTotal').textContent = fmt(total);
  document.getElementById('statCount').textContent = count;
  document.getElementById('statAvg').textContent   = fmt(count ? total / count : 0);
  document.getElementById('statMax').textContent   = fmt(count ? Math.max(...list.map(e => e.amount)) : 0);

  const catTotals = CATEGORIES.map((cat, i) => ({
    cat, i, sum: list.filter(e => e.category === cat.id).reduce((s, e) => s + e.amount, 0)
  })).filter(r => r.sum > 0).sort((a, b) => b.sum - a.sum);

  document.getElementById('categoryBars').innerHTML = catTotals.length === 0
    ? '<p style="color:var(--text-muted);font-size:14px">No data yet.</p>'
    : catTotals.map(({ cat, sum, i }) => `
        <div class="cat-bar-row">
          <div class="cat-bar-meta">
            <span class="cat-bar-name">${cat.emoji} ${cat.label}</span>
            <span class="cat-bar-vals">${fmt(sum)} · ${total ? (sum/total*100).toFixed(1) : 0}%</span>
          </div>
          <div class="cat-bar-track">
            <div class="cat-bar-fill color-${i % 9}" style="width:${total ? sum/total*100 : 0}%"></div>
          </div>
        </div>`).join('');

  renderLineChart(list);
}

// ── LINE CHART ────────────────────────────────────────────────
function renderLineChart(list) {
  const canvas = document.getElementById('lineChart');
  const ctx = canvas.getContext('2d');
  const byDate = {};
  for (const e of list) byDate[e.date] = (byDate[e.date] || 0) + e.amount;
  const dates = Object.keys(byDate).sort();
  const amounts = dates.map(d => byDate[d]);

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  const PAD = { top: 12, right: 16, bottom: 32, left: 52 };
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;

  if (dates.length === 0) {
    ctx.fillStyle = '#7a7a90'; ctx.font = '14px DM Sans'; ctx.textAlign = 'center';
    ctx.fillText('No data to display', W / 2, H / 2); return;
  }

  const maxVal = Math.max(...amounts);
  const n = amounts.length;
  const xP = i => PAD.left + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yP = v => PAD.top + cH - (v / maxVal) * cH;

  ctx.strokeStyle = '#2a2a38'; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = PAD.top + (g / 4) * cH;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    ctx.fillStyle = '#7a7a90'; ctx.font = '11px DM Sans'; ctx.textAlign = 'right';
    ctx.fillText('₹' + (maxVal - (g / 4) * maxVal).toFixed(0), PAD.left - 5, y + 4);
  }

  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
  grad.addColorStop(0, 'rgba(240,192,96,0.35)');
  grad.addColorStop(1, 'rgba(240,192,96,0)');
  ctx.beginPath(); ctx.moveTo(xP(0), yP(amounts[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(xP(i), yP(amounts[i]));
  ctx.lineTo(xP(n - 1), PAD.top + cH); ctx.lineTo(xP(0), PAD.top + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.moveTo(xP(0), yP(amounts[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(xP(i), yP(amounts[i]));
  ctx.strokeStyle = '#f0c060'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();

  for (let i = 0; i < n; i++) {
    ctx.beginPath(); ctx.arc(xP(i), yP(amounts[i]), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f0c060'; ctx.fill();
    ctx.strokeStyle = '#0a0a0f'; ctx.lineWidth = 2; ctx.stroke();
  }

  const lblIdx = n <= 5 ? dates.map((_, i) => i) : [0, Math.floor(n/3), Math.floor(2*n/3), n-1];
  ctx.fillStyle = '#7a7a90'; ctx.font = '10px DM Sans'; ctx.textAlign = 'center';
  for (const i of [...new Set(lblIdx)]) {
    const d = parseLocalDate(dates[i]);
    ctx.fillText(d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }), xP(i), H - 8);
  }
}

// ── RENDER: DATA TAB ─────────────────────────────────────────
function renderDataTab() {
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  document.getElementById('storageCount').textContent   = expenses.length;
  document.getElementById('storageOldest').textContent  = sorted.length ? fmtDate(sorted[0].date) : '—';
  document.getElementById('storageNewest').textContent  = sorted.length ? fmtDate(sorted[sorted.length-1].date) : '—';
  document.getElementById('lastExported').textContent   = LS.get('budget_last_export', 'Never');
  document.getElementById('lastSynced').textContent     = LS.get('budget_last_sync', 'Never');
  const url = LS.get('budget_sheets_url', '');
  if (url) document.getElementById('sheetsUrl').value = url;
}

function fmtDate(d) {
  return parseLocalDate(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── RENDER ALL ────────────────────────────────────────────────
function renderAll() {
  renderHeader();
  renderMonthFilter();
  renderExpenses();
  renderDataTab();
}

// ── ADD EXPENSE ───────────────────────────────────────────────
function renderCategoryGrid() {
  document.getElementById('categoryGrid').innerHTML = CATEGORIES.map(cat =>
    `<button class="cat-chip ${cat.id === selectedCat ? 'selected' : ''}" data-id="${cat.id}">
      <span class="cat-chip-emoji">${cat.emoji}</span>
      <span class="cat-chip-label">${cat.label}</span>
    </button>`
  ).join('');
  document.querySelectorAll('.cat-chip').forEach(btn =>
    btn.addEventListener('click', () => {
      selectedCat = btn.dataset.id;
      document.querySelectorAll('.cat-chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    }));
}

function openModal() {
  editingId = null;
  document.getElementById('modalHeading').textContent = 'New Expense';
  document.getElementById('saveBtn').textContent      = 'Save Expense';
  document.getElementById('expDate').value   = new Date().toISOString().slice(0, 10);
  document.getElementById('expTitle').value  = '';
  document.getElementById('expAmount').value = '';
  selectedCat = CATEGORIES[0].id;
  renderCategoryGrid();
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('expTitle').focus(), 400);
}

function openEditModal(id) {
  const expense = expenses.find(e => e.id === id);
  if (!expense) return;
  editingId = id;
  document.getElementById('modalHeading').textContent = 'Edit Expense';
  document.getElementById('saveBtn').textContent      = 'Update Expense';
  document.getElementById('expTitle').value  = expense.title;
  document.getElementById('expAmount').value = expense.amount;
  document.getElementById('expDate').value   = expense.date;
  selectedCat = expense.category;
  renderCategoryGrid();
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('expTitle').focus(), 400);
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

function saveExpense() {
  const title  = document.getElementById('expTitle').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const date   = normaliseDate(document.getElementById('expDate').value);
  if (!title || isNaN(amount) || amount <= 0 || !date) { showToast('Please fill in all fields', 'error'); return; }

  if (editingId) {
    // Update existing expense
    expenses = expenses.map(e =>
      e.id === editingId ? { ...e, title, amount, category: selectedCat, date } : e
    );
    LS.set('budget_expenses', expenses);
    closeModal();
    renderAll();
    showToast('Expense updated ✓', 'success');
  } else {
    // Add new expense
    expenses.unshift({ id: uid(), title, amount, category: selectedCat, date });
    LS.set('budget_expenses', expenses);
    closeModal();
    renderAll();
    showToast('Expense added ✓', 'success');
  }
}

function deleteExpense(id) {
  expenses = expenses.filter(e => e.id !== id);
  LS.set('budget_expenses', expenses);
  renderAll();
  showToast('Deleted');
}

// ── EXPORT ────────────────────────────────────────────────────
function exportData() {
  if (expenses.length === 0) { showToast('No data to export', 'error'); return; }
  const payload = { version: 2, exported: new Date().toISOString(), expenses };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href     = url;
  a.download = `budget-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const ts = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  LS.set('budget_last_export', ts);
  renderDataTab();
  showToast(`Exported ${expenses.length} entries ✓`, 'success');
}

// ── IMPORT ────────────────────────────────────────────────────
function triggerImport() { document.getElementById('importFileInput').click(); }

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const incoming = Array.isArray(data) ? data : (data.expenses || []);
      if (!incoming.length) { showToast('No expenses found in file', 'error'); return; }

      // Validate shape
      const valid = incoming.every(x => x.id && x.title && x.amount != null && x.date);
      if (!valid) { showToast('File format not recognised', 'error'); return; }

      showConfirm(
        '📥 Import Data',
        `This will merge ${incoming.length} expense(s) into your app. Duplicate entries will be skipped.`,
        () => {
          const existingIds = new Set(expenses.map(e => e.id));
          const newOnes = incoming.filter(e => !existingIds.has(e.id)).map(e => ({ ...e, date: normaliseDate(e.date) }));
          expenses = [...expenses, ...newOnes].sort((a, b) => b.date.localeCompare(a.date));
          LS.set('budget_expenses', expenses);
          renderAll();
          showToast(`Imported ${newOnes.length} new entry(s) ✓`, 'success');
        }
      );
    } catch { showToast('Could not read file', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = ''; // reset so same file can be re-selected
}

// ── GOOGLE SHEETS SYNC ────────────────────────────────────────
async function pushToSheets() {
  const url = LS.get('budget_sheets_url', '');
  if (!url) { showToast('Paste your Apps Script URL first', 'error'); return; }

  const btn = document.getElementById('syncPushBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinning">↻</span> Pushing...';

  try {
    // Send data as a GET request with encoded payload to avoid CORS preflight issues
    const payload = encodeURIComponent(JSON.stringify(expenses));
    const res = await fetch(url + '?action=push&data=' + payload, {
      method: 'GET',
      redirect: 'follow',
    });
    const json = await res.json();
    if (json.status === 'ok') {
      const ts = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      LS.set('budget_last_sync', ts);
      renderDataTab();
      showToast(`Pushed ${expenses.length} entries to Sheets ✓`, 'success');
    } else {
      showToast('Sheets error: ' + (json.message || 'unknown'), 'error');
    }
  } catch (err) {
    showToast('Could not reach Sheets. Check URL or network.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Push to Sheets';
  }
}

async function pullFromSheets() {
  const url = LS.get('budget_sheets_url', '');
  if (!url) { showToast('Paste your Apps Script URL first', 'error'); return; }

  const btn = document.getElementById('syncPullBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinning">↻</span> Pulling...';

  try {
    const res  = await fetch(url + '?action=pull');
    const json = await res.json();
    if (json.status === 'ok' && Array.isArray(json.expenses)) {
      showConfirm(
        '📥 Pull from Sheets',
        `Found ${json.expenses.length} expense(s) in your Sheet. Existing entries will be updated and new ones added.`,
        () => {
          const incoming = json.expenses.map(e => ({ ...e, date: normaliseDate(e.date) }));
          const incomingMap = new Map(incoming.map(e => [e.id, e]));
          // Update existing entries with sheet data, keep local-only entries
          let updatedCount = 0;
          const merged = expenses.map(e => {
            if (incomingMap.has(e.id)) {
              updatedCount++;
              return { ...e, ...incomingMap.get(e.id) };
            }
            return e;
          });
          // Add brand-new entries from sheet not present locally
          const localIds = new Set(expenses.map(e => e.id));
          const brandNew = incoming.filter(e => !localIds.has(e.id));
          expenses = [...merged, ...brandNew].sort((a, b) => b.date.localeCompare(a.date));
          LS.set('budget_expenses', expenses);
          const ts = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
          LS.set('budget_last_sync', ts);
          renderAll();
          showToast(`${brandNew.length} new · ${updatedCount} updated ✓`, 'success');
        }
      );
    } else {
      showToast('Sheets error: ' + (json.message || 'unknown'), 'error');
    }
  } catch {
    showToast('Could not reach Sheets. Check URL or network.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg> Pull from Sheets';
  }
}

// ── CONFIRM MODAL ─────────────────────────────────────────────
function showConfirm(title, msg, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent   = msg;
  document.getElementById('confirmOverlay').classList.add('open');
  document.getElementById('confirmOkBtn').onclick = () => {
    closeConfirm(); onConfirm();
  };
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); }

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast' + (type ? ' ' + type : '');
  el.style.visibility = 'visible';
  el.classList.add('show');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.classList.remove('show');
    // Wait for slide-out animation to finish, then fully hide
    setTimeout(() => { el.style.visibility = 'hidden'; }, 350);
  }, 2400);
}

// ── UTILS ─────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

const escHtml = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ── EVENTS ────────────────────────────────────────────────────

// Add expense
document.getElementById('openAddBtn').addEventListener('click', openModal);
document.getElementById('closeModalBtn').addEventListener('click', closeModal);
document.getElementById('saveBtn').addEventListener('click', saveExpense);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});
document.getElementById('expAmount').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveExpense();
});

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'stats') renderStats();
    if (btn.dataset.tab === 'data')  renderDataTab();
  });
});

document.getElementById('monthFilter').addEventListener('change', e => {
  activeMonth = e.target.value; renderAll();
});

// Data tab
document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('importBtn').addEventListener('click', triggerImport);
document.getElementById('importFileInput').addEventListener('change', handleImportFile);
document.getElementById('syncPushBtn').addEventListener('click', pushToSheets);
document.getElementById('syncPullBtn').addEventListener('click', pullFromSheets);

document.getElementById('saveUrlBtn').addEventListener('click', () => {
  const url = document.getElementById('sheetsUrl').value.trim();
  if (!url.startsWith('https://script.google.com')) {
    showToast('Please paste a valid Apps Script URL', 'error'); return;
  }
  LS.set('budget_sheets_url', url);
  showToast('URL saved ✓', 'success');
});

document.getElementById('setupToggle').addEventListener('click', () => {
  const el = document.getElementById('setupSteps');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('clearDataBtn').addEventListener('click', () => {
  showConfirm('🗑️ Clear All Data', `This will permanently delete all ${expenses.length} expense(s). This cannot be undone.`, () => {
    expenses = [];
    LS.set('budget_expenses', expenses);
    renderAll();
    showToast('All data cleared', 'success');
  });
});

// Confirm modal
document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirm);
document.getElementById('confirmOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('confirmOverlay')) closeConfirm();
});

// Resize chart
window.addEventListener('resize', () => {
  if (document.getElementById('tab-stats').classList.contains('active')) renderStats();
});


// ── THEME TOGGLE ──────────────────────────────────────────────
function initTheme() {
  const saved = LS.get('budget_theme', 'dark');
  applyTheme(saved);
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light', isLight);
  document.getElementById('themeIconDark').style.display  = isLight ? 'none'  : 'block';
  document.getElementById('themeIconLight').style.display = isLight ? 'block' : 'none';
  LS.set('budget_theme', theme);
}

function toggleTheme() {
  const current = LS.get('budget_theme', 'dark');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);

// ── SERVICE WORKER ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── INIT ──────────────────────────────────────────────────────
initTheme();
renderAll();
