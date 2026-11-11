# Teachable Feature — Frontend Requirements

Companion to [TEACHABLE_HANDOFF.md](TEACHABLE_HANDOFF.md) (backend). This document lists the frontend
components and changes users need to interact with the teachable backend. **No frontend code is on this
branch.** Everything below is still to be built (or merged; see §7).

## 1. What already exists on `main`

- `frontend/src/components/ImageZoom.tsx`: a zoomable image (100–400%, buttons, wheel, drag to pan). It
  draws numbered marker boxes from `findings` and has a built-in explanation panel for the selected
  finding.
- `frontend/src/detection/detector.ts`: `Finding { id, label, explanation, x, y, w, h }`, and
  `Detection.findings?`.
- `frontend/src/detection/httpDetector.ts`: maps `result.findings` from `/analysis/run`.
- `frontend/src/state/AppState.tsx`: keeps `findings` on `currentResult` for the session; `toHistorySafe()`
  strips them before saving to History.
- `frontend/src/pages/Results.tsx`: renders `<ImageZoom src alt findings />` in the preview column.

## 2. Data plumbing (types and mapping)

| File | Change |
|---|---|
| `frontend/src/api/client.ts` | On `AnalysisFindingPayload` add `confidence?: number` and `tip?: string`. On `AnalysisRunResultPayload` add `explanation_method?: string`, and `general_cues?: GeneralCuePayload[]` once the backend fallback ships. |
| `frontend/src/detection/detector.ts` | On `Finding` add `confidence?: number` (0–100) and `tip?: string`. Add a `GeneralCue { id, label, explanation, tip?, appliesBecause? }` type. On `Detection` add `explanationMethod?: string` and `generalCues?: GeneralCue[]`. |
| `frontend/src/detection/httpDetector.ts` | Map `explanation_method → explanationMethod` and `general_cues → generalCues` (convert `applies_because` → `appliesBecause`, default `[]`). |
| `frontend/src/state/AppState.tsx` | Copy `explanationMethod` and `generalCues` onto `currentResult`. Keep them out of History (`toHistorySafe()`), the same as `findings`. |

Everything new is optional, so the UI must still work when a provider leaves out `tip`, `confidence` or
`general_cues`.

## 3. Components required

### 3.1 `TeachableView` (new; replaces `ImageZoom` in `Results.tsx`)

`<TeachableView src alt result />`, laid out in two columns (image about 60%, panel about 40%). It
collapses to one column at ≤ 860px.

**Left column**

- The zoomable image with region markers (`ImageZoom`, see §3.2).
- **Show / hide heatmap** toggle (`aria-pressed`).
- **Clear selection** button (zooms back to 100% and deselects).
- A short usage hint, e.g. "Hover a region to preview it, click to zoom in. On touch, tap a marker or a
  region in the list."

**Right column (panel)**

1. **Verdict block:** verdict label, confidence %, `Explanation method: {explanationMethod}`, and
   "N regions flagged". Tint it by verdict (real / warn / fake).
2. **Flagged regions list:** an ordered list of buttons, each with a number badge matching the marker,
   the label, and the region confidence % if present. Clicking one selects it and **animates the image to
   zoom in on that region**. The selected item shows `aria-pressed`.
3. **Detail card** (`aria-live="polite"`) for the selected region: title with badge, explanation,
   **"What to check:"** tip (if present), "Region confidence: N%" (if present) and "Approximate area,
   not an exact outline." With nothing selected: "Select a region to see why it was flagged."
4. **General cues section**, needed once the backend fallback ships (see §4).
5. **Honesty note:** "These regions show where to look, not proof that the image is fake." If
   `explanationMethod` contains "mock", add: "In this demo they are example cues, not real model output."
   Otherwise add: "They are approximate, and real photos can show the same cues."

Pre-select the first finding on load.

### 3.2 `ImageZoom` (extend the existing component)

| Requirement | Why |
|---|---|
| Expose an imperative handle via `forwardRef`: `frame(id)` (animate the zoom to fit that region and select it) and `reset()` | So the panel list can drive the image |
| Controlled selection: props `activeId` + `onActiveChange`, still working uncontrolled if they're omitted | So the panel and image stay in sync |
| `showPanel` prop (default `true`) to hide the built-in explanation panel | `TeachableView` renders its own panel |
| `showHeatmap` prop: one soft radial glow per region, opacity based on `confidence` (default about 60) | Heatmap toggle. The backend has no saliency data, so this is cosmetic; label it that way |
| Draw markers outside the scaled image, projected to screen pixels | Borders and badges keep the same size at every zoom level |
| Hover tooltip (mouse/pen only) with label, explanation and confidence; flip above or below and clamp to the viewport | Quick preview without clicking |
| Click a marker → animated zoom to that region (about 300 ms; jump instantly if `prefers-reduced-motion`) | The core "teach by zooming in" interaction |
| Ignore the click if the pointer moved more than about 4 px (it was a pan) | So panning over a large marker doesn't trigger a zoom |
| While zoomed in, auto-select the region under the viewport center | Panning around updates the explanation |
| Overlapping regions: the smallest box under the pointer wins | Nested regions stay reachable |
| Keyboard: markers are buttons, focus selects, Enter frames | Accessibility |

**Marker styling** (`index.css`): idle markers use a faint dashed outline and a number badge. The
selected or hovered marker gets a solid amber (`--warning`) border with a light fill. Badges are about
1.5rem, dark text on amber, with a white ring. Check legibility in dark mode and with the large-text
display setting.

### 3.3 `Results.tsx`

Replace `<ImageZoom … findings={…} />` with `<TeachableView src={previewUrl} alt={fileName}
result={currentResult} />`. Let the preview column span the full card width when `TeachableView` shows
the panel (e.g. `.result-preview:has(.teachable) { flex: 1 1 100%; max-width: none; }`).

## 4. General-explanation fallback UI (needed with backend §7)

| Case | What to show |
|---|---|
| `findings` empty, `generalCues` present | Keep the two columns: plain zoomable image (no markers) on the left. On the right, the verdict block plus a **"What to look for in this image"** list. Each cue shows label, explanation, "What to check:" tip, and `appliesBecause` in a muted "Why this applies: …" line. |
| A few `findings` + `generalCues` | Region list and detail card as usual, then an **"Other things to check"** section with the general cues. |
| `real` verdict with cues | A collapsible "What to check anyway" section, worded as guidance, not suspicion. |
| Neither findings nor cues | The plain zoomable image, as today. |

Honesty note for general cues: "These are common signs of AI-generated images that are worth checking
here. They are not specific detections in this image."

## 5. Accessibility and responsiveness checklist

- Markers and list items are real `<button>`s with `aria-label="Finding N: label"` and `aria-pressed`.
- The tooltip uses `role="tooltip"` and is linked with `aria-describedby` while hovered.
- Detail and explanation areas are `aria-live="polite"`.
- Zoom controls sit in a `role="group"` with a label.
- Respect `prefers-reduced-motion`.
- Works in a single column below 860px; on touch, use tap plus the list (no hover).
- Works with dark mode and large text (from the display settings).

## 6. Acceptance tests (manual)

Use the backend with `DETECTION_PROVIDER=stub` and `STUB_DEMO_VERDICT=fake`, `warn`, then empty:

1. A face photo set to `fake` shows 4 numbered regions; `warn` shows 3; `real` shows the plain viewer.
2. Clicking a list item or a marker zooms in on that region and updates the detail card.
3. Hover shows a tooltip; panning doesn't select by accident; Clear selection resets to 100%.
4. The heatmap toggle shows and hides the glows.
5. The method line and honesty note change between stub ("mock") and OpenRouter results.
6. After the backend fallback ships: an image with no findings shows "What to look for in this image"
   with reasons that match the image (for example, a screenshot without camera data shows the
   missing-camera-information cue).
7. History entries don't include findings or cues.

## 7. Reference prototype

The original developer has an **uncommitted local prototype** of §2–§3 (`TeachableView.tsx`,
`styles/teachable.css`, and the `ImageZoom` / `index.css` / plumbing changes). It isn't on this branch. Ask
them for it if you want a starting point. It doesn't include the general-cues UI from §4.
