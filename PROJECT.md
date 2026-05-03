# Budget PWA — Project Documentation

> Auto-generated from full build conversation. Update this file whenever changes are made.

---

## 1. Project Overview

A **lightweight personal budgeting Progressive Web App (PWA)** built for iPhone and Android, hosted for free on GitHub Pages. No native app, no App Store, no backend server.

**Problem it solves:** A simple, always-available expense tracker that works offline, installs to the home screen like a native app, and optionally syncs to a private Google Sheet for backup and cross-device access.

**Target users:** Individuals who want a no-frills personal expense tracker without signing up to a service or paying for an app. Specifically built for an Indian user (currency: ₹, locale: `en-IN`).

---

## 2. Key Features

### Expense Management
- Add expenses with title, amount, date, and category
- Edit any existing expense (reuses the Add modal)
- Archive expenses (soft delete) with an **Undo** toast (4 second window)
- Restore or permanently delete archived expenses
- Expenses grouped by date in the list view

### Filtering & Navigation
- **Month filter** in the header (right side of Total Spent) — scoped to months that have data; always includes current month
- **Category filter chips** in the Expenses tab — dynamically built from `CATEGORIES`; combines with month filter
- **Archive panel** at the bottom of the Expenses tab with a badge count

### Stats
- Total spent, entry count, average per entry, largest expense
- Category breakdown with percentage bars
- Spending-over-time line chart (custom canvas, no external chart lib)
- All stats scoped to the currently selected month

### Data & Sync
- **Online mode** (Sheets URL configured): all reads/writes go to Google Sheets; `localStorage` not used for expense data
- **Offline mode** (no URL): all data saved to `localStorage`
- **Export to JSON** — downloads a backup file; can be saved to Google Drive via Share sheet
- **Import from JSON** — merges entries, skips duplicates by ID
- **Pull from Sheets** — merges sheet data into local; updates changed entries, adds new ones
- **Auto-sync** — every mutation (add/edit/archive/restore/delete) silently pushes to Sheets if URL is configured; shows error toast only on failure
- On app load in online mode: pulls fresh data from Sheets before rendering
- On month change in online mode: re-pulls from Sheets

### UI & Theming
- Dark mode (default) and light mode toggle — persisted in `localStorage`
- Toggle button (sun/moon SVG icons) in the header
- Theme applied to `<html>` element via inline style to fix Android overscroll background
- Smooth 0.25s transition between themes
- `theme-color` meta tag updated on toggle (affects Android browser chrome bar)
- Toast notifications (success / error / with Undo button)

### PWA Capabilities
- Installable to home screen via Safari/Chrome "Add to Home Screen"
- Offline-capable via Service Worker (cache-first strategy)
- Custom app icon (rupee symbol on teal background)
- Favicon in `.ico`, 16px, and 32px PNG formats
- `manifest.json` with correct `start_url` and `scope` for subfolder deployment

---

## 3. Technical Architecture

### Stack
| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (no frameworks) |
| PWA | Service Worker + Web App Manifest |
| Hosting | GitHub Pages (free, static) |
| Backend/Sync | Google Apps Script Web App (deployed as URL) |
| Database | Google Sheets (online mode) / `localStorage` (offline mode) |
| Fonts | Google Fonts — DM Serif Display + DM Sans |

### File Structure
```
/budget/
├── index.html          # App shell, all UI markup
├── style.css           # All styles, dark/light themes via CSS variables
├── app.js              # All app logic
├── categories.js       # CATEGORIES array — edit here to change categories
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker
├── apps-script.gs      # Google Apps Script code (deployed separately)
├── favicon.ico         # Multi-size favicon
├── favicon-16.png
├── favicon-32.png
├── icons/
│   ├── icon-192.png    # PWA icon
│   └── icon-512.png
└── PROJECT.md          # This file
```

### Key Design Decisions
- **No build tools** — plain JS/CSS, deployable by uploading files directly to GitHub
- **Categories in a separate file** (`categories.js`) — easy to edit without touching app logic
- **CSS variables for theming** — dark vars on `:root`, light vars on `html.light` and `body.light`
- **Service Worker uses `Promise.allSettled`** — one failed cache entry doesn't break install
- **Google Sheets sync via GET requests** — avoids CORS preflight; `Content-Type: text/plain` POST triggers preflight and was abandoned
- **Single Apps Script handles both push and pull** via `doGet()` with `?action=` parameter
- **Online/offline mode** detected by presence of Sheets URL in `localStorage`

---

## 4. Data Models

### Expense
```javascript
{
  id:       string,   // uid() — timestamp + random base36
  title:    string,   // user-entered description
  amount:   number,   // float, in ₹
  category: string,   // matches a CATEGORIES[].id
  date:     string,   // always YYYY-MM-DD (normalised on every read/write)
}
```

### Archived Expense
Same as Expense. Stored in `localStorage` key `budget_archived`. In Google Sheets, identified by column G = `"yes"`.

### Category
```javascript
{ id: string, label: string, emoji: string }
```
Defined in `categories.js`. Current list:
`takeout, groceries, transport, housing, health, insurance, investment, entertain, shopping, education, utilities, other`

### Google Sheet Schema
| Col | Field | Notes |
|---|---|---|
| A | ID | Unique expense ID |
| B | Title | Expense description |
| C | Amount | Numeric |
| D | Category | Category ID string |
| E | Date | YYYY-MM-DD plain text (forced via `@STRING@` format) |
| F | Synced At | ISO timestamp set by Apps Script |
| G | Archived | `""` = active, `"yes"` = archived |

---

## 5. Important Implementation Details

### Date Handling (Critical)
Dates are a major source of bugs. Rules enforced throughout:

- **Always store as `YYYY-MM-DD` string.** Never store a Date object or locale string.
- **`normaliseDate(raw)`** — converts any format (long Android strings, ISO timestamps, already correct strings) to `YYYY-MM-DD` using **local** `getFullYear/getMonth/getDate` — never UTC methods, which cause a 1-day shift in IST (UTC+5:30).
- **`parseLocalDate(str)`** — parses `YYYY-MM-DD` as `new Date(y, m-1, d)` (local), never `new Date('YYYY-MM-DD')` which iOS/Android parse as UTC midnight.
- **Google Sheets** auto-converts date-like strings to date serial numbers. Fix: `setNumberFormat('@STRING@')` on column E; on read, use `Utilities.formatDate()` with script timezone if value is a `Date` object.
- **`normaliseDate` is called** on load (from localStorage), on import, on pull from Sheets, and on save.

### Online vs Offline Mode
- `isOnlineMode()` returns `!!LS.get('budget_sheets_url', '')` — truthy if URL is saved
- Online: `LS.set` for expenses/archived is skipped; Sheets is source of truth
- Offline: full `localStorage` usage
- `pullSilent()` — pulls all data from Sheets into memory without a confirm dialog; used on startup and month change

### CORS and Google Apps Script
- **Only GET requests work** without CORS issues. `Content-Type: text/plain` POST triggers a preflight which Apps Script doesn't serve CORS headers for.
- Apps Script must be deployed with **Who has access: Anyone** (not "Only myself") — "Only myself" returns a 302 redirect to a login page, which the browser blocks as a CORS error.
- Data is passed as URL-encoded JSON in `?data=` and `?arch=` query parameters.

### Service Worker
- Uses `Promise.allSettled` per asset so one 404 doesn't fail the whole install
- Google API URLs are explicitly excluded from interception (`return;` not `e.respondWith(fetch(...))`)
- Cache version is incremented (`budget-v15`) on every deploy that changes cached files

### Toast System
- `showToast(msg, type)` — auto-hides after 2.4s; uses `visibility: hidden` after slide-out so iOS doesn't leave a ghost element
- `showToastWithUndo(msg, onUndo)` — 4s timeout; uses `el.querySelector('.toast-undo')` not `getElementById` (element is set via innerHTML so ID lookup can fail)

### Safe Event Listener Pattern
All event listeners use `on(id, event, fn)` helper which silently skips if element doesn't exist. This prevents crashes when buttons are conditionally present.

### Category Filter
- Built dynamically in `buildCategoryFilter()` from the `CATEGORIES` array
- Never hardcoded in HTML — change `categories.js` and the filter updates automatically
- `activeCat` state variable; combined with `activeMonth` in `filterExpenses()`

---

## 6. Issues Encountered & Fixes

### CORS Errors with Google Apps Script
- **Cause 1:** Using `POST` with `Content-Type: application/json` triggers a CORS preflight. Apps Script doesn't return CORS headers.
- **Cause 2:** `Who has access: Only myself` causes a 302 redirect to Google login, which the browser refuses as a CORS violation.
- **Fix:** Use GET requests only. Set access to **Anyone**. Pass data as URL-encoded query params.

### Invalid Date on iOS and Android
- **Cause:** `new Date('2026-05-02')` is parsed as UTC midnight by iOS/Android WebKit. In IST (UTC+5:30) this becomes 11:30 PM the previous day, showing the wrong date.
- **Fix:** Use `parseLocalDate()` which calls `new Date(y, m-1, d)` — always local time.

### Date Off By One Day When Pulling from Sheets
- **Cause:** Google Sheets auto-converts date-like strings to internal date serial numbers. When read back, Apps Script returns a JS Date object at UTC midnight, which shifts to the previous day in IST.
- **Fix:** Force column E to plain text format with `setNumberFormat('@STRING@')`. On read, use `Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'yyyy-MM-dd')`.

### Toast Not Fully Disappearing on iOS
- **Cause:** `translateY(80px)` moves the element off-screen but it remains visible/interactive.
- **Fix:** Added `opacity: 0; visibility: hidden` to hidden state; `opacity: 1; visibility: visible` to `.show` class.

### Android Overscroll Background Shows Wrong Colour
- **Cause:** CSS variables on `body.light` don't propagate to `<html>`, which is what Android renders the rubber-band overscroll area from.
- **Fix:** Apply `html.light` class in addition to `body.light`; set `document.documentElement.style.background` as an inline style in `applyTheme()` — inline styles beat all CSS.

### Service Worker Crashes Install (`addAll` error)
- **Cause:** `cache.addAll()` is all-or-nothing — one bad path fails the entire install.
- **Fix:** Use `Promise.allSettled` with individual `cache.add()` calls.

### `showToastWithUndo` Not Defined
- **Cause:** The function was lost during a refactoring pass.
- **Fix:** Re-added; also switched from `getElementById('toastUndoBtn')` to `el.querySelector('.toast-undo')` since the element is created via innerHTML and may not be queryable by ID in all browsers at that moment.

### `Cannot read properties of null (reading 'addEventListener')`
- **Cause:** `document.getElementById()` returning null when a button was removed from HTML but its event listener remained in JS.
- **Fix:** Replaced all `getElementById(...).addEventListener(...)` with a safe `on(id, event, fn)` helper that silently no-ops on null.

### Orphan `});` Causing Syntax Errors
- **Cause:** Accumulated during multiple automated edits that wrapped and unwrapped code blocks.
- **Fix:** Identified and removed. Location was between the tab button listeners and the month filter listener.

### Push to Sheets Not Saving Archived Entries
- **Cause:** URL-encoded payload for both `data` and `arch` params exceeded browser URL length limits (~2000 chars). The `arch` param was silently truncated.
- **Fix (final):** Switched from POST body to GET params, but kept payloads in the App Script `doGet` handler. For large datasets, data is sent via separate `pushActive` and `pushArchived` actions in chunks. Eventually simplified to single `push` action with both arrays.

---

## 7. Known Limitations / Trade-offs

- **URL length limit for sync:** If a user has hundreds of expenses, the GET request with encoded JSON could exceed URL length limits. Mitigation: chunked sending (implemented) but still a potential issue at large scale.
- **No authentication on Sheets URL:** Anyone who obtains the Apps Script URL can read/write your data. The long random URL acts as a shared secret. Acceptable for personal use.
- **No pagination:** All expenses are loaded into memory at once. Performance fine for personal use (hundreds of entries), not designed for thousands.
- **Stats tab only shows current month:** Stats always reflect the month selected in the header filter. There's no "all time" stats view.
- **Archive doesn't sync on undo:** Undo of archive fires `autoSync()` but there's a brief window where the sheet is ahead of local state.
- **No conflict resolution:** If the same expense is edited locally and in the sheet before a sync, last-write wins.
- **PWA icon is auto-generated:** Only shows approximate rupee symbol; custom icon uploaded by user is higher quality.

---

## 8. Setup & Usage Notes

### Deploying to GitHub Pages
1. Create a public GitHub repository named `budget`
2. Upload all project files maintaining the folder structure
3. Go to **Settings → Pages → Source: Deploy from branch → main / root**
4. App available at `https://YOUR-USERNAME.github.io/budget`

### Installing to iPhone
1. Open `https://YOUR-USERNAME.github.io/budget` in **Safari**
2. Tap the Share button → **Add to Home Screen**
3. Edit the name if needed → **Add**
4. Go to **Settings → General → VPN & Device Management → [Your Apple ID] → Trust** (first time only for non-TestFlight installs — not needed for web apps)

### Setting Up Google Sheets Sync
1. Create a new Google Spreadsheet
2. **Extensions → Apps Script**
3. Paste full contents of `apps-script.gs`, replacing existing code
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Authorise (click Advanced → Go to app → Allow on the Google warning screen)
6. Copy the Web App URL
7. In the Budget app → **Data tab → paste URL → Save URL**

### Redeploying Apps Script After Changes
Changes to `apps-script.gs` require a **new deployment** (not "Manage deployments" → edit). Each new deployment gets a new URL which must be updated in the app.

### Changing Categories
Edit `categories.js` only. The category grid in the Add/Edit modal, the filter chips, and the stats bars all read from this file dynamically. No HTML changes needed.

---

## 9. Future Improvements

- **Budget limits per category** — set a monthly cap and get a visual warning when approaching it
- **Recurring expenses** — mark an expense as recurring and auto-add it each month
- **CSV export** — for use in Excel or other tools
- **All-time stats view** — aggregate stats ignoring the month filter
- **Search** — full-text search across expense titles
- **Multiple accounts/wallets** — tag expenses by payment method
- **iCloud / Google Drive direct sync** — instead of Apps Script workaround
- **Conflict resolution on pull** — prompt user when a sheet entry differs from local
- **Pagination or virtual scroll** — for large expense lists
- **Category budget ring chart** — visual donut per category vs budget

---

## 10. Important Context for Future LLM Use

### Critical Rules — Do Not Violate
1. **Always use `normaliseDate()` on any date read from storage, network, or user input.** Never store a raw Date object or locale string.
2. **Always use `parseLocalDate(str)` when converting YYYY-MM-DD to a Date for display.** Never use `new Date('YYYY-MM-DD')` — it's UTC on iOS/Android.
3. **Google Sheets sync must use GET requests.** POST triggers CORS preflight which Apps Script can't handle. Data goes in URL-encoded query params.
4. **Apps Script must be deployed with `Who has access: Anyone`.** "Only myself" causes a 302 → CORS error.
5. **Apply theme to `<html>` not just `<body>`.** Use `document.documentElement.style.background` as inline style for the overscroll background on Android.
6. **Never use `getElementById(...).addEventListener(...)` directly.** Use the `on(id, event, fn)` helper — it silently skips missing elements.
7. **Categories live in `categories.js` only.** Never hardcode category lists in `index.html` or `app.js`.
8. **Bump the service worker cache version** (`budget-vN`) every time any cached file changes.
9. **When redeploying Apps Script,** always use "New deployment" — editing an existing deployment doesn't update the URL but does update the code for that URL... except sometimes it doesn't. New deployment is safer.

### Patterns That Work Well
- `Promise.allSettled` for service worker precaching — tolerates 404s gracefully
- `el.querySelector('.toast-undo')` after setting `innerHTML` — more reliable than `getElementById` for dynamically inserted elements
- Checking `isOnlineMode()` before every `LS.set` — keeps online/offline logic clean
- Building UI elements dynamically from `CATEGORIES` — filter chips, category grids, stat bars all stay in sync when categories change

### Things That Caused Confusion
- **`doPost` vs `doGet` in Apps Script:** We tried POST multiple times and hit CORS every time. GET is the only viable approach without a real backend.
- **"Only myself" access level** looks safe but causes silent 302 redirects → CORS errors. Must be "Anyone".
- **`cache.addAll()` is atomic** — one bad URL breaks everything. Always use `Promise.allSettled` with individual adds.
- **Orphan `});`** — accumulated from automated edits. Always check for syntax errors after automated find-replace operations on JS.
- **Line numbers in error messages shift** after edits — use `grep` to find strings rather than relying on reported line numbers.
- **`manifest.json` `start_url` and `scope`** must match the GitHub Pages subfolder exactly (e.g. `/budget/` not `/budget-app/`). Wrong value = home screen shortcut opens wrong URL.

### Repository / Deployment Notes
- GitHub repo is named `budget` (not `budget-app`) → URL is `/budget/`
- All `sw.js` asset paths use `/budget/` prefix
- `manifest.json` `start_url` and `scope` are `/budget/`
- User's GitHub username: `prasanthcpk`
- Full URL: `https://prasanthcpk.github.io/budget`
- Currency: ₹ (Indian Rupee), locale: `en-IN`
