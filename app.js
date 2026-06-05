/**
 * Daily Expense Tracker — Application Logic
 * MIT License
 * Copyright (c) 2026
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 */

'use strict';

/* ── Constants ───────────────────────────────────────── */
const STORAGE_KEY   = 'ledger_expenses_v1';
const THEME_KEY     = 'ledger_theme_v1';
const CAT_LABELS    = {
  food:          '🍜 Food & Dining',
  transport:     '🚌 Transport',
  shopping:      '🛍 Shopping',
  health:        '💊 Health',
  entertainment: '🎬 Entertainment',
  utilities:     '💡 Utilities',
  travel:        '✈️ Travel',
  education:     '📚 Education',
  other:         '📌 Other',
};
const CAT_ICONS = {
  food: '🍜', transport: '🚌', shopping: '🛍', health: '💊',
  entertainment: '🎬', utilities: '💡', travel: '✈️', education: '📚', other: '📌',
};

/* ── State ───────────────────────────────────────────── */
let expenses   = [];
let deleteTarget = null;  // id pending confirmation

/* ── DOM Refs ────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const form           = $('expenseForm');
const editIdInput    = $('editId');
const descInput      = $('expDesc');
const amountInput    = $('expAmount');
const dateInput      = $('expDate');
const categorySelect = $('expCategory');
const noteInput      = $('expNote');
const submitBtn      = $('submitBtn');
const cancelEditBtn  = $('cancelEdit');
const formTitle      = $('formTitle');

const totalSpentEl   = $('totalSpent');
const weekSpentEl    = $('weekSpent');
const todaySpentEl   = $('todaySpent');
const totalCountEl   = $('totalCount');
const catBreakdown   = $('categoryBreakdown');

const expenseList    = $('expenseList');
const emptyState     = $('emptyState');
const expenseBadge   = $('expenseBadge');
const searchInput    = $('searchInput');
const filterCat      = $('filterCategory');
const sortOrder      = $('sortOrder');
const clearAllBtn    = $('clearAllBtn');

const modalOverlay   = $('modalOverlay');
const modalCancel    = $('modalCancel');
const modalConfirm   = $('modalConfirm');
const toast          = $('toast');
const themeToggle    = $('themeToggle');
const currentDateEl  = $('currentDate');

/* ── Persistence ─────────────────────────────────────── */
function load() {
  try {
    expenses = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    expenses = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

/* ── Helpers ─────────────────────────────────────────── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmt(n) {
  return '$' + Number(n).toFixed(2);
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function monthStart() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupLabel(iso) {
  const today = todayISO();
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  return formatDisplayDate(iso);
}

/* ── Theme ───────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

/* ── Header Date ─────────────────────────────────────── */
function updateHeaderDate() {
  currentDateEl.textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

/* ── Summary ─────────────────────────────────────────── */
function updateSummary() {
  const now      = todayISO();
  const wStart   = weekStart();
  const mStart   = monthStart();

  let total = 0, week = 0, today = 0, monthCount = 0;

  for (const e of expenses) {
    const amt = parseFloat(e.amount);
    if (e.date >= mStart) { total += amt; monthCount++; }
    if (e.date >= wStart) week  += amt;
    if (e.date === now)   today += amt;
  }

  totalSpentEl.textContent = fmt(total);
  weekSpentEl.textContent  = fmt(week);
  todaySpentEl.textContent = fmt(today);
  totalCountEl.textContent = `${monthCount} expense${monthCount !== 1 ? 's' : ''} this month`;
}

/* ── Category Breakdown ──────────────────────────────── */
function updateBreakdown() {
  const mStart = monthStart();
  const totals = {};
  let grand = 0;

  for (const e of expenses) {
    if (e.date < mStart) continue;
    const amt = parseFloat(e.amount);
    totals[e.category] = (totals[e.category] || 0) + amt;
    grand += amt;
  }

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    catBreakdown.innerHTML = '<p class="empty-hint">No expenses yet.</p>';
    return;
  }

  catBreakdown.innerHTML = sorted.map(([cat, amt]) => {
    const pct = grand > 0 ? (amt / grand) * 100 : 0;
    return `
      <div class="cat-row" data-cat="${cat}">
        <span class="cat-dot"></span>
        <div class="cat-info">
          <span class="cat-name">${CAT_LABELS[cat] ?? cat}</span>
          <div class="cat-bar-wrap">
            <div class="cat-bar" style="width:${pct.toFixed(1)}%"></div>
          </div>
        </div>
        <span class="cat-amount">${fmt(amt)}</span>
      </div>`;
  }).join('');
}

/* ── Render Expense List ─────────────────────────────── */
function getFiltered() {
  const query = searchInput.value.trim().toLowerCase();
  const cat   = filterCat.value;
  const sort  = sortOrder.value;

  let list = expenses.filter(e => {
    const matchCat    = cat === 'all' || e.category === cat;
    const matchSearch = !query ||
      e.description.toLowerCase().includes(query) ||
      (e.note && e.note.toLowerCase().includes(query)) ||
      (CAT_LABELS[e.category] || '').toLowerCase().includes(query);
    return matchCat && matchSearch;
  });

  switch (sort) {
    case 'newest':  list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt); break;
    case 'oldest':  list.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt); break;
    case 'highest': list.sort((a, b) => b.amount - a.amount); break;
    case 'lowest':  list.sort((a, b) => a.amount - b.amount); break;
  }

  return list;
}

function renderList() {
  const list = getFiltered();
  expenseBadge.textContent = list.length;
  clearAllBtn.style.display = expenses.length ? 'inline-flex' : 'none';

  if (list.length === 0) {
    expenseList.innerHTML = '';
    expenseList.appendChild(emptyState);
    emptyState.style.display = 'flex';
    return;
  }
  emptyState.style.display = 'none';

  // Group by date (only when sorted by newest/oldest)
  const sort = sortOrder.value;
  const useGroups = sort === 'newest' || sort === 'oldest';

  if (useGroups) {
    const groups = {};
    for (const e of list) {
      (groups[e.date] = groups[e.date] || []).push(e);
    }
    const dateKeys = Object.keys(groups).sort(sort === 'newest'
      ? (a, b) => b.localeCompare(a)
      : (a, b) => a.localeCompare(b)
    );

    expenseList.innerHTML = dateKeys.map(date => `
      <div class="expense-group">
        <div class="expense-group-label">${groupLabel(date)}</div>
        ${groups[date].map(expenseHTML).join('')}
      </div>`
    ).join('');
  } else {
    expenseList.innerHTML = list.map(expenseHTML).join('');
  }

  // Attach button listeners
  expenseList.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => beginEdit(btn.dataset.edit))
  );
  expenseList.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete(btn.dataset.delete))
  );
}

function expenseHTML(e) {
  return `
    <div class="expense-item" data-cat="${e.category}">
      <div class="expense-cat-icon">${CAT_ICONS[e.category] ?? '📌'}</div>
      <div class="expense-meta">
        <div class="expense-desc">${escHtml(e.description)}</div>
        <div class="expense-sub">
          <span class="expense-cat-tag" data-cat="${e.category}">${CAT_LABELS[e.category] ?? e.category}</span>
          ${e.note ? `· <span>${escHtml(e.note)}</span>` : ''}
        </div>
      </div>
      <div class="expense-right">
        <span class="expense-amount">${fmt(e.amount)}</span>
        <div class="expense-actions">
          <button class="btn-row-action" data-edit="${e.id}" title="Edit" aria-label="Edit expense">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-row-action delete" data-delete="${e.id}" title="Delete" aria-label="Delete expense">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Full Re-render ──────────────────────────────────── */
function render() {
  updateSummary();
  updateBreakdown();
  renderList();
}

/* ── Form: Add / Edit ────────────────────────────────── */
form.addEventListener('submit', e => {
  e.preventDefault();

  const description = descInput.value.trim();
  const amount      = parseFloat(amountInput.value);
  const date        = dateInput.value;
  const category    = categorySelect.value;
  const note        = noteInput.value.trim();

  if (!description || isNaN(amount) || amount <= 0 || !date || !category) {
    showToast('Please fill in all required fields.');
    return;
  }

  const editId = editIdInput.value;

  if (editId) {
    // Update existing
    const idx = expenses.findIndex(ex => ex.id === editId);
    if (idx !== -1) {
      expenses[idx] = { ...expenses[idx], description, amount, date, category, note };
      showToast('Expense updated.');
    }
    resetForm();
  } else {
    // Add new
    expenses.unshift({ id: uid(), description, amount, date, category, note, createdAt: Date.now() });
    showToast('Expense added.');
    resetForm();
  }

  save();
  render();
});

function beginEdit(id) {
  const e = expenses.find(ex => ex.id === id);
  if (!e) return;

  editIdInput.value       = e.id;
  descInput.value         = e.description;
  amountInput.value       = e.amount;
  dateInput.value         = e.date;
  categorySelect.value    = e.category;
  noteInput.value         = e.note || '';

  formTitle.textContent   = 'Edit Expense';
  submitBtn.textContent   = 'Save Changes';
  cancelEditBtn.style.display = 'inline-flex';

  // Scroll to form on mobile
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  descInput.focus();
}

function resetForm() {
  form.reset();
  editIdInput.value = '';
  dateInput.value   = todayISO();
  formTitle.textContent   = 'Add Expense';
  submitBtn.textContent   = 'Add Expense';
  cancelEditBtn.style.display = 'none';
}

cancelEditBtn.addEventListener('click', resetForm);

/* ── Delete ──────────────────────────────────────────── */
function confirmDelete(id) {
  deleteTarget = id;
  modalOverlay.classList.add('active');
}

modalCancel.addEventListener('click', () => {
  deleteTarget = null;
  modalOverlay.classList.remove('active');
});

modalConfirm.addEventListener('click', () => {
  if (!deleteTarget) return;
  expenses = expenses.filter(e => e.id !== deleteTarget);
  deleteTarget = null;
  modalOverlay.classList.remove('active');
  save();
  render();
  showToast('Expense deleted.');
  // If we were editing this item, reset form
  if (editIdInput.value === deleteTarget) resetForm();
});

modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) {
    deleteTarget = null;
    modalOverlay.classList.remove('active');
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
    deleteTarget = null;
    modalOverlay.classList.remove('active');
  }
});

/* ── Clear All ───────────────────────────────────────── */
clearAllBtn.addEventListener('click', () => {
  if (!expenses.length) return;
  // Reuse modal
  $('modalTitle').textContent = 'Clear all expenses?';
  $('modalBody').textContent  = 'This will permanently delete all recorded expenses.';
  deleteTarget = '__ALL__';
  modalOverlay.classList.add('active');
});

// Patch confirm handler to handle __ALL__
const originalConfirm = modalConfirm.onclick;
modalConfirm.addEventListener('click', () => {
  if (deleteTarget === '__ALL__') {
    expenses = [];
    deleteTarget = null;
    modalOverlay.classList.remove('active');
    $('modalTitle').textContent = 'Delete expense?';
    $('modalBody').textContent  = 'This action cannot be undone.';
    save();
    render();
    resetForm();
    showToast('All expenses cleared.');
  }
}, false);

/* ── Search / Filter / Sort ──────────────────────────── */
searchInput.addEventListener('input', renderList);
filterCat.addEventListener('change', renderList);
sortOrder.addEventListener('change', renderList);

/* ── Toast ───────────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

/* ── Init ────────────────────────────────────────────── */
function init() {
  // Theme
  const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
  applyTheme(savedTheme);

  // Header date
  updateHeaderDate();
  setInterval(updateHeaderDate, 60_000);

  // Default date to today
  dateInput.value = todayISO();

  // Load & render
  load();
  render();
}

init();
