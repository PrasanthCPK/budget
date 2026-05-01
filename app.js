/* ============================================================
   BUDGET PWA — App Logic
   ============================================================ */

'use strict';

// ── CATEGORIES ──────────────────────────────────────────────
const CATEGORIES = [
  { id: 'food',      label: 'Food',        emoji: '🍔' },
  { id: 'transport', label: 'Transport',   emoji: '🚗' },
  { id: 'housing',   label: 'Housing',     emoji: '🏠' },
  { id: 'health',    label: 'Health',      emoji: '💊' },
  { id: 'entertain', label: 'Fun',         emoji: '🎮' },
  { id: 'shopping',  label: 'Shopping',    emoji: '🛍️' },
  { id: 'education', label: 'Education',   emoji: '📚' },
  { id: 'utilities', label: 'Utilities',   emoji: '🔧' },
  { id: 'other',     label: 'Other',       emoji: '🌀' },
];

// ── STORAGE ──────────────────────────────────────────────────
function loadExpenses() {
  try {
    return JSON.parse(localStorage.getItem('budget_expenses') || '[]');
  } catch { return []; }
}

function saveExpenses(expenses) {
  localStorage.setItem('budget_expenses', JSON.stringify(expenses));
}

// ── STATE ────────────────────────────────────────────────────
let expenses = loadExpenses();
let selectedCategory = CATEGORIES[0].id;
let activeFilter = 'all';
let activeMonth = '';

// ── HELPERS ──────────────────────────────────────────────────
const fmt = (n) => '₹' + Number(n).toFixed(2);

function getMonths() {
  const set = new Set(expenses.map(e => e.date.slice(0, 7)));
  return [...set].sort().reverse();
}

function filterExpenses() {
  let list = [...expenses];
  if (activeMonth) list = list.filter(e => e.date.startsWith(activeMonth));
  if (activeFilter === 'week') {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000);
    list = list.filter(e => new Date(e.date) >= weekAgo);
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

// ── RENDER: HEADER ───────────────────────────────────────────
function renderHeader() {
  const filtered = filterExpenses();
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  document.getElementById('totalDisplay').textContent = fmt(total);

  const now = new Date();
  const label = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  document.getElementById('monthLabel').textContent = label;
}

// ── RENDER: MONTH FILTER ─────────────────────────────────────
function renderMonthFilter() {
  const sel = document.getElementById('monthFilter');
  const months = getMonths();
  sel.innerHTML = '<option value="">All time</option>' +
    months.map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(y, mo - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return `<option value="${m}">${label}</option>`;
    }).join('');
  sel.value = activeMonth;
}

// ── RENDER: EXPENSE LIST ─────────────────────────────────────
function renderExpenses() {
  const list = filterExpenses();
  const container = document.getElementById('expenseList');

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🪙</div>
        <p>No expenses here yet.<br/>Tap <strong>+</strong> to add one.</p>
      </div>`;
    return;
  }

  // Group by date
  const groups = {};
  for (const e of list) {
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  }

  container.innerHTML = Object.entries(groups).map(([date, items]) => {
    const d = new Date(date + 'T00:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const rows = items.map(e => {
      const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[8];
      return `
        <div class="expense-item" data-id="${e.id}">
          <div class="expense-emoji">${cat.emoji}</div>
          <div class="expense-info">
            <div class="expense-title">${escHtml(e.title)}</div>
            <div class="expense-cat">${cat.label}</div>
          </div>
          <div class="expense-right">
            <span class="expense-amount">${fmt(e.amount)}</span>
            <button class="delete-btn" data-id="${e.id}" aria-label="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');
    return `<div class="date-group-label">${label}</div>${rows}`;
  }).join('');

  // Delete handlers
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteExpense(btn.dataset.id));
  });
}

// ── RENDER: STATS ─────────────────────────────────────────────
function renderStats() {
  const list = filterExpenses();
  const total = list.reduce((s, e) => s + e.amount, 0);
  const count = list.length;
  const avg = count ? total / count : 0;
  const max = count ? Math.max(...list.map(e => e.amount)) : 0;

  document.getElementById('statTotal').textContent = fmt(total);
  document.getElementById('statCount').textContent = count;
  document.getElementById('statAvg').textContent = fmt(avg);
  document.getElementById('statMax').textContent = fmt(max);

  // Category bars
  const bars = document.getElementById('categoryBars');
  const catTotals = CATEGORIES.map((cat, i) => {
    const sum = list.filter(e => e.category === cat.id).reduce((s, e) => s + e.amount, 0);
    return { cat, sum, i };
  }).filter(r => r.sum > 0).sort((a, b) => b.sum - a.sum);

  bars.innerHTML = catTotals.length === 0
    ? '<p style="color:var(--text-muted);font-size:14px;padding:8px 0;">No data yet.</p>'
    : catTotals.map(({ cat, sum, i }) => {
        const pct = total ? (sum / total * 100).toFixed(1) : 0;
        const barW = total ? (sum / total * 100) : 0;
        return `
          <div class="cat-bar-row">
            <div class="cat-bar-meta">
              <span class="cat-bar-name">${cat.emoji} ${cat.label}</span>
              <span class="cat-bar-vals">${fmt(sum)} · ${pct}%</span>
            </div>
            <div class="cat-bar-track">
              <div class="cat-bar-fill color-${i % 9}" style="width:${barW}%"></div>
            </div>
          </div>`;
      }).join('');

  renderLineChart(list);
}

// ── LINE CHART ────────────────────────────────────────────────
let chartInstance = null;

function renderLineChart(list) {
  const canvas = document.getElementById('lineChart');
  const ctx = canvas.getContext('2d');

  // Aggregate by date
  const byDate = {};
  for (const e of list) {
    byDate[e.date] = (byDate[e.date] || 0) + e.amount;
  }
  const dates = Object.keys(byDate).sort();
  const amounts = dates.map(d => byDate[d]);

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  if (dates.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#7a7a90';
    ctx.font = '14px DM Sans';
    ctx.textAlign = 'center';
    ctx.fillText('No data to display', canvas.width / 2, canvas.height / 2);
    return;
  }

  // Draw simple chart manually (no external lib needed)
  drawSimpleChart(canvas, ctx, dates, amounts);
}

function drawSimpleChart(canvas, ctx, dates, amounts) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const PAD = { top: 12, right: 16, bottom: 32, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...amounts);
  const n = amounts.length;

  const xPos = (i) => PAD.left + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const yPos = (v) => PAD.top + chartH - (v / maxVal) * chartH;

  // Grid lines
  ctx.strokeStyle = '#2a2a38';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = PAD.top + (g / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();

    // Y labels
    const val = maxVal - (g / 4) * maxVal;
    ctx.fillStyle = '#7a7a90';
    ctx.font = `${11 * 1}px DM Sans`;
    ctx.textAlign = 'right';
    ctx.fillText('$' + val.toFixed(0), PAD.left - 6, y + 4);
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH);
  grad.addColorStop(0, 'rgba(240,192,96,0.35)');
  grad.addColorStop(1, 'rgba(240,192,96,0)');

  ctx.beginPath();
  ctx.moveTo(xPos(0), yPos(amounts[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(xPos(i), yPos(amounts[i]));
  ctx.lineTo(xPos(n - 1), PAD.top + chartH);
  ctx.lineTo(xPos(0), PAD.top + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(xPos(0), yPos(amounts[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(xPos(i), yPos(amounts[i]));
  ctx.strokeStyle = '#f0c060';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Dots
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(xPos(i), yPos(amounts[i]), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f0c060';
    ctx.fill();
    ctx.strokeStyle = '#0a0a0f';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // X labels (show first, last, and up to 3 middle)
  const labelIndices = n <= 5
    ? dates.map((_, i) => i)
    : [0, Math.floor(n / 3), Math.floor(2 * n / 3), n - 1];

  ctx.fillStyle = '#7a7a90';
  ctx.font = `${10}px DM Sans`;
  ctx.textAlign = 'center';
  for (const i of [...new Set(labelIndices)]) {
    const d = new Date(dates[i] + 'T00:00:00');
    const lbl = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ctx.fillText(lbl, xPos(i), H - 8);
  }
}

// ── ADD EXPENSE ───────────────────────────────────────────────
function renderCategoryGrid() {
  document.getElementById('categoryGrid').innerHTML = CATEGORIES.map(cat => `
    <button class="cat-chip ${cat.id === selectedCategory ? 'selected' : ''}" data-id="${cat.id}">
      <span class="cat-chip-emoji">${cat.emoji}</span>
      <span class="cat-chip-label">${cat.label}</span>
    </button>
  `).join('');

  document.querySelectorAll('.cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCategory = btn.dataset.id;
      document.querySelectorAll('.cat-chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
}

function openModal() {
  document.getElementById('expDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('expTitle').value = '';
  document.getElementById('expAmount').value = '';
  selectedCategory = CATEGORIES[0].id;
  renderCategoryGrid();
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('expTitle').focus(), 400);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function saveExpense() {
  const title = document.getElementById('expTitle').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const date = document.getElementById('expDate').value;

  if (!title || isNaN(amount) || amount <= 0 || !date) {
    showToast('Please fill in all fields');
    return;
  }

  const expense = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    title,
    amount,
    category: selectedCategory,
    date,
  };

  expenses.unshift(expense);
  saveExpenses(expenses);
  closeModal();
  renderAll();
  showToast('Expense added ✓');
}

function deleteExpense(id) {
  expenses = expenses.filter(e => e.id !== id);
  saveExpenses(expenses);
  renderAll();
  showToast('Deleted');
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// ── RENDER ALL ────────────────────────────────────────────────
function renderAll() {
  renderHeader();
  renderMonthFilter();
  renderExpenses();
  renderStats();
}

// ── ESCAPE HTML ───────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── EVENTS ────────────────────────────────────────────────────
document.getElementById('openAddBtn').addEventListener('click', openModal);
document.getElementById('closeModalBtn').addEventListener('click', closeModal);
document.getElementById('saveBtn').addEventListener('click', saveExpense);

document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'stats') renderStats();
  });
});

// Chip filters
document.querySelectorAll('.chip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderAll();
  });
});

// Month filter
document.getElementById('monthFilter').addEventListener('change', e => {
  activeMonth = e.target.value;
  renderAll();
});

// Enter key on form
document.getElementById('expAmount').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveExpense();
});

// Redraw chart on resize
window.addEventListener('resize', () => {
  if (document.getElementById('tab-stats').classList.contains('active')) {
    renderStats();
  }
});

// ── SERVICE WORKER REGISTRATION ───────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── INIT ──────────────────────────────────────────────────────
renderAll();
