# Frontend — Figma replication

React + TypeScript + Vite replication of the Figma file
**PRJ544_DeepfakeDetection** (`1KQ4bdMC3NOlHZVtDRzN0G`).

```bash
npm install
npm run dev      # http://localhost:5173
```

Seed data is hardcoded in `src/data/mock.ts` and the verdict comes from
`src/detection/mockDetector.ts` — no backend calls yet. Copy, scores and
timestamps are transcribed from the design frames.

Detection sits behind the `Detector` interface in
`src/detection/detector.ts`: `analyze(file, signal) → Promise<Detection>`,
which may reject and honours cancellation. `mockDetector` is the only
adapter today; the HTTP adapter that calls the backend drops in beside it
and is injected via `<AppStateProvider detector={…}>`. A `Detection`
carries only verdict, label, confidence and summary — the app stamps id,
fileName and timestamps when it commits the run.

`AnalysisResult` carries **two** time fields and they must stay in sync:
`timestamp` is the display string worded exactly as the Figma shows it,
and `createdAt` is ISO 8601 and is the only value ever sorted on. Never
parse `timestamp`.

## Screens and routes

| Route | Figma frame | Node |
| --- | --- | --- |
| `/` | Landing Page | `3:182` |
| `/login` | Log In | `3:187` |
| `/create-account` | Create Account | `9:8` |
| `/upload` | Image Upload | `20:12` |
| `/results` | Image Results | `3:4` |
| `/history` | History · Sorting · DeletePopUp · Deleted History | `3:188` `126:162` `156:118` `117:101` |
| `/result/:id` | Result from History · Saved Confirmation | `20:45` `115:50` |
| `/profile` | Profile | `57:38` |

Navigation is wired end to end: landing → sign up/in → upload → analyze →
results → save → history → open a row → delete → profile → log out.
Auth is mocked (any non-empty credentials work) and kept in
`sessionStorage` so a refresh doesn't drop you back to the landing page.

## Design tokens

Taken from the Style Guide frame (`3:51`) and defined in `src/index.css`:

| Token | Value |
| --- | --- |
| `--primary` | `#17324d` |
| `--secondary` | `#2f6fed` |
| `--accent` | `#20a39e` |
| `--background` | `#f6f8fb` |
| `--text` | `#182230` |
| `--secondary-text` | `#5d6978` |
| `--borders` | `#d8e0ea` |
| `--successful` | `#16845b` |
| `--warning` | `#c9a227` |
| `--error` | `#c63c45` |

Icons in `public/assets/` are exported straight from Figma, not
hand-drawn. The artboard background rects Figma bakes into single-node
SVG exports were stripped so they render transparent.

## Design system

Reusable UI lives in `src/components/ui` (import from `../components/ui`):
`Button`, `IconButton`, `TextField`, `Select`, `Card`, `Alert`, `Spinner`,
`VerdictBadge`, `ScoreDial`, `Toast`, `PageHeader`, `EmptyState`. Styles are
split into `src/styles/` — `tokens.css` (colours, spacing, radius, type,
result-state colours), `base.css`, `components.css`, `layout.css` — and
`index.css` keeps only page-specific rules.

Open **`/styleguide`** (no login needed) to see every token and component
with copy-paste usage.

Layout is responsive: mobile ≤767px, tablet 768–1279px, desktop ≥1280px
(the Figma artboard is 1440px). Use CSS media queries for layout, and
`useIsMobile()` from `src/hooks/useMediaQuery.ts` only when behaviour or
copy differs by device.

## Deliberate deviations

1. **Controls the design omits.** Three frames show a state with no
   control to reach it, so these were added using the design's own
   button treatment (`--btn-dark` fill, 8px radius, Inter Bold 16):
   - `/upload` — **Analyze image** / **Clear** (the frame shows the step
     tracker but nothing advances it to step 2).
   - `/results` — **Save result** / **Analyze another**, anchored under
     the score ellipse where the design leaves space, so the card keeps
     its 731px height.
   - `/profile` — **Save changes** next to the existing Log Out.
   - `/upload` — a detection-failure message, since no frame covers the
     case and the `Detector` interface admits rejection.

2. **Fixed 1440px stage.** The Figma is a fixed 1440×1024 artboard and
   the layout reproduces that geometry 1:1, so the page scrolls
   horizontally below 1440px. Made responsive on request.

3. **Telegraf font.** The History rows and auth field labels specify
   Telegraf / PP Telegraf, which is a licensed font and is not bundled.
   Inter is used as the fallback; drop the licensed files in and update
   `--font-body` to match the design exactly.

4. **Empty landing tiles.** The REAL and Deepfake tiles on the landing
   page are empty placeholders in the design, so they render as
   labelled cards ready for example imagery.
