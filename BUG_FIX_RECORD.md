# AeroPulse – Bug Fix Record

> Maintained by: Antigravity AI
> Project: AeroPulse VMC Energy Monitor
> Repo: kshitijpradhan248-debug/Navonmesh_2026_MechaVision

---

## Session 1 — 2026-02-27

### BUG-001 · Commit `b6aaeb6` (Pre-fix)
**File:** `frontend/src/App.jsx` — Line 1
**Type:** Unused Import
**Severity:** Low
**Description:** `useRef` was imported from React but never used anywhere in the component tree.
**Fix:** Removed `useRef` from the import statement.
```diff
- import { useEffect, useState, useRef } from 'react'
+ import { useEffect, useState } from 'react'
```

---

### BUG-002 · Commit `9f08a97`
**File:** `frontend/src/App.jsx` — Sparkline Component
**Type:** SVG ID Collision (Visual Bug)
**Severity:** High
**Description:** The `<linearGradient>` inside every `<Sparkline>` component used a hardcoded `id="sg"`. When multiple Sparkline components rendered on the same page (one per machine in the sidebar + one in the detail panel), all SVG `fill="url(#sg)"` references pointed to whichever gradient was defined last in the DOM — causing all sparklines except the last to render with the wrong gradient or no fill at all.
**Fix:** Added a module-level counter `_sparkId` and used `useState` to assign each Sparkline instance a unique gradient ID (`sg_0`, `sg_1`, `sg_2`...) at mount time.
```diff
- <linearGradient id="sg" ...>
- <polygon fill="url(#sg)" ...>
+ const [gid] = useState(() => `sg_${_sparkId++}`)
+ <linearGradient id={gid} ...>
+ <polygon fill={`url(#${gid})`} ...>
```

---

### BUG-003 · Commit `9f08a97`
**File:** `frontend/src/App.jsx` — `fmtUptime()` function
**Type:** Logic Error (Wrong Math)
**Severity:** Medium
**Description:** The uptime formatter reused variables incorrectly. The original code:
```js
const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60)
return `${h}h ${m % 60}m ${s % 60}s`
```
`m % 60` computed remainder of the total minutes (not capped), and `s % 60` computed remainder of total seconds — both were wrong for large uptime values. E.g. at 1h 5m 30s, `m` = 65, so `m % 60` = 5 ✅ (accidentally correct), but `s` = 3930, `s % 60` = 30 ✅ — however the logic was fragile and non-obvious. Also `h` was computed as `Math.floor(m / 60)` where `m` was still total minutes, which was correct but only by coincidence.
**Fix:** Rewritten using a clear, unambiguous chain:
```js
const totalSec = Math.floor(ms / 1000)
const h = Math.floor(totalSec / 3600)
const m = Math.floor((totalSec % 3600) / 60)
const s = totalSec % 60
return `${h}h ${m}m ${s}s`
```

---

### BUG-004 · Commit `9f08a97`
**File:** `frontend/src/index.css` — `.brand-name` class
**Type:** Cross-Browser Compatibility
**Severity:** Low
**Description:** The gradient text on the app title only had `-webkit-background-clip: text` without the standard `background-clip: text` property. This means the gradient text would not render correctly on Firefox or other non-WebKit browsers.
**Fix:** Added the standard property alongside the vendor-prefixed version.
```diff
  -webkit-background-clip: text;
+ background-clip: text;
  -webkit-text-fill-color: transparent;
```

---

### BUG-005 · Commit `9f08a97`
**File:** `frontend/src/index.css` — `.main` class
**Type:** CSS Grid Layout Bug
**Severity:** Medium
**Description:** `.main` had `flex: 1` which is a Flexbox property but `.main` lives inside `.app` which is a **CSS Grid** container. `flex: 1` has no effect inside a grid — it was left over from an old layout refactor. This caused `.main` to not correctly fill the remaining vertical space below the summary bar, leading to the sidebar and detail panel being cut off or overflowing incorrectly.
**Fix:** Replaced `flex: 1` with `min-height: 0`, which is the correct CSS Grid fix. Without `min-height: 0`, grid children default to `min-height: auto` (their content size), preventing proper shrinking within the grid track.
```diff
- flex: 1;
+ min-height: 0; /* allows grid children to shrink below content size */
```

---

### BUG-006 · Commit `9f08a97`
**File:** `frontend/src/index.css` — `.machine-metrics` class
**Type:** Minor UI Layout
**Severity:** Low
**Description:** The sidebar machine cards now show 4 metrics (kW Actual, Avg. Current, Power Factor, kWh Total) in a 2×2 grid but the gap was uniform `6px`, making rows feel too close together and columns too far apart.
**Fix:** Changed to asymmetric gap `4px 8px` (row-gap 4px, column-gap 8px) for better visual balance.
```diff
- gap: 6px;
+ gap: 4px 8px;
```

---

### BUG-007 · Operational Issue (Not a code bug)
**Issue:** Website not loading after debug session
**Root Cause:** The Vite frontend dev server was not restarted after the debug commit. Only the Node.js backend was restarted. The frontend process had been killed earlier.
**Resolution:** Started Vite dev server manually:
```powershell
cd frontend
npm run dev   # → http://localhost:3000
```
**Prevention:** Both servers must be running simultaneously:
- `backend/` → `node server.js` → port 3001
- `frontend/` → `npm run dev` → port 3000

---

## How to Start the App

```powershell
# Terminal 1
cd "c:\Users\Gayatri\OneDrive\Desktop\Navonmesh 2026\backend"
node server.js

# Terminal 2
cd "c:\Users\Gayatri\OneDrive\Desktop\Navonmesh 2026\frontend"
npm run dev
```

Then open **http://localhost:3000** in Chrome.
