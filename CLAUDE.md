# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A **no-build, no-framework** personal budgeting PWA (Progressive Web App) for iPhone/Android, hosted on GitHub Pages at `https://prasanthcpk.github.io/budget`. Currency is ₹ (Indian Rupee), locale `en-IN`. There is no npm, no bundler, no transpiler — edit files and push.

## Deployment

- **GitHub Pages**: push to `main`, GitHub Pages serves the root automatically.
- **Service Worker cache version**: bump the `budget-vN` cache string in `index.html` (the `CONFIGURE` postMessage call) every time any cached file changes. The SW is notified via `postMessage`, not a version in `sw.js`.
- **Apps Script**: any change to `apps-script.gs` requires a **new deployment** in Google Apps Script (not editing an existing one). The new URL must be re-pasted in the app's Data tab.

## Architecture

### File roles
| File | Purpose |
|---|---|
| `index.html` | App shell — all HTML markup and SW registration/postMessage |
| `app.js` | All application logic (~900 lines, no modules) |
| `categories.js` | Single source of truth for categories — `CATEGORIES` array |
| `style.css` | All styles; dark/light themes via CSS variables |
| `sw.js` | Service Worker — cache-first, configured by postMessage from `index.html` |
| `apps-script.gs` | Server-side Google Apps Script (deployed separately as a Web App) |

### Data flow
- **Online mode** (Sheets URL saved in `localStorage`): every mutation calls `syncUpsert()`/`syncDelete()` to update the individual row in Sheets. On startup and month change, `pullSilent()` fetches the active month's sheet tab. `localStorage` is not used for expense data in this mode.
- **Offline mode** (no URL): all data is read/written to `localStorage` keys `budget_expenses` and `budget_archived`.
- Mode is detected by `isOnlineMode()` → `!!LS.get('budget_sheets_url', '')`.

### Google Sheets schema
Each calendar month gets its own sheet tab named `MonthName_YYYY_Expenses` (e.g. `May_2026_Expenses`). Columns: `ID | Title | Amount | Category | Date | Synced At | Archived`. Column E (Date) is forced to plain-text format (`@STRING@`) to prevent Sheets from converting it to a date serial.

### State variables (top of `app.js`)
- `expenses` / `archived` — in-memory arrays, loaded from localStorage on startup then replaced by Sheets data in online mode
- `activeMonth` — currently selected `YYYY-MM` string
- `activeCat` — selected category filter chip (`'all'` or a category id)
- `editingId` — `null` = adding new expense, string = editing existing

## Critical Rules

1. **Date handling**: always pass dates through `normaliseDate(raw)` on any read (from storage, network, or user input). Always use `parseLocalDate('YYYY-MM-DD')` when converting to a `Date` object — never `new Date('YYYY-MM-DD')`, which iOS/Android WebKit parse as UTC midnight causing a 1-day offset in IST.

2. **Google Sheets sync uses GET only**. POST triggers a CORS preflight that Apps Script cannot respond to. Data is passed as URL-encoded query params (`?action=upsert&expense=...`).

3. **Apps Script access level must be "Anyone"**. "Only myself" causes a 302 redirect to Google login, which the browser rejects as a CORS violation.

4. **Apply theme to `<html>`, not just `<body>`**. Use `document.documentElement.style.background` as an inline style — this beats all CSS and fixes the Android overscroll bounce background colour.

5. **Never call `getElementById(...).addEventListener(...)` directly**. Use the `on(id, event, fn)` helper defined in `app.js` — it silently skips if the element doesn't exist, preventing null-reference crashes when buttons are conditionally present.

6. **Categories live only in `categories.js`**. All UI elements (filter chips, category grid in the add modal, stats bars) are built dynamically from the `CATEGORIES` array. Never hardcode category lists elsewhere.

7. **Service Worker `Promise.allSettled`**: `cache.addAll()` is atomic — one 404 fails the whole install. The SW uses `Promise.allSettled` with individual `cache.add()` calls to tolerate missing assets gracefully.

## Key Patterns

- `renderAll()` calls `renderHeader()`, `renderExpenses()`, `buildCategoryFilter()`, and `renderDataTab()` — the main full-redraw entry point.
- `autoSync(expense, archivedFlag)` is called after every mutation (add/edit/archive/restore/delete) to silently push to Sheets; shows an error toast only on failure.
- `showToastWithUndo(msg, onUndo)` uses `el.querySelector('.toast-undo')` (not `getElementById`) because the element is injected via `innerHTML` and may not be queryable by ID immediately.
- The line chart in the Stats tab is drawn on a `<canvas>` element with no external chart library.

## Changing Categories

Edit `categories.js` only — add/remove/rename entries in the `CATEGORIES` array. No HTML or JS changes required; all dependent UI rebuilds automatically.
