# Teachable Feature — Frontend Requirements

Companion to [TEACHABLE_HANDOFF.md](TEACHABLE_HANDOFF.md) (backend). This document lists the frontend
components and changes users need to interact with the teachable backend. **The frontend on this branch
is identical to `main`.** Everything in §2–§4 is still to be built, on top of `main`'s current components.

## 1. What `main` already has

- **`frontend/src/components/ImageZoom.tsx`:** a zoomable image (100–400%, buttons, wheel, drag to pan).
  - Draws numbered marker boxes from `findings`. The outline-only style lets the actual image show through.
  - **Auto-selects the first finding.**
  - **Clicking a marker zooms in on that region** (`zoomToFinding`, about 70% fit, at least 200%).
  - Has a built-in explanation panel below the image: label, explanation, and a "Model-suggested cue —
    not definitive proof" note.
- **`frontend/src/detection/detector.ts`:** `Finding { id, label, explanation, x, y, w, h }`, and
  `Detection.findings?`. `Detection` also carries `onlineSearch` and `forensics`.
- **`frontend/src/detection/httpDetector.ts`:** maps `result.findings` from `/analysis/run`. On a
  `partial` response (detection failed) it sets `findings: []`.
- **`frontend/src/state/AppState.tsx`:** keeps `findings` on `currentResult` for the session;
  `toHistorySafe()` strips them before saving to History.
- **`frontend/src/pages/Results.tsx`:** `<ImageZoom src alt findings />` in the preview column, plus
  `OnlineSearchPanel` and `ForensicsPanel` further down the page.

## 2. Data plumbing (types and mapping)

| File | Change |
|---|---|
| `frontend/src/api/client.ts` | Extend the finding payload type with `tip?: string` and `confidence?: number`. On the run result payload add `explanation_method?: string`, and `general_cues?: GeneralCuePayload[]` once the backend fallback ships. |
| `frontend/src/detection/detector.ts` | On `Finding` add `tip?: string` and `confidence?: number` (0–100). Add `GeneralCue { id, label, explanation, tip?, appliesBecause? }`. On `Detection` add `explanationMethod?: string` and `generalCues?: GeneralCue[]`. |
| `frontend/src/detection/httpDetector.ts` | Map `explanation_method → explanationMethod` and `general_cues → generalCues` (`applies_because → appliesBecause`, default `[]`). Do this for the `partial` path too, because the fallback can return cues even when detection failed. On that path the backend's `result` is `null`, so the cues may arrive at the top level of the response instead. Confirm the location with the backend implementation (handoff §7.2, "Wiring"). |
| `frontend/src/state/AppState.tsx` | Copy `explanationMethod` and `generalCues` onto `currentResult`. Keep them out of History (`toHistorySafe()`), the same as `findings`. |

Everything new is optional, so the UI must still work when the backend leaves out `tip`, `confidence`,
`explanation_method` or `general_cues`.

## 3. Components required

### 3.1 Teachable panel (new component, e.g. `TeachablePanel.tsx`)

The panel sits next to the image on desktop and below it on narrow screens (≤ 860px). It replaces
ImageZoom's built-in panel (see §3.2). It contains:

1. **Verdict line:** verdict label, confidence %, "Explanation method: {explanationMethod}", and
   "N regions flagged".
2. **Flagged regions list:** an ordered list of buttons, each with a number badge matching the marker,
   the label, and the region confidence % if present. Clicking one selects it and **zooms the image to that
   region** (reuse ImageZoom's `zoomToFinding`, see §3.2). The selected item shows `aria-pressed`.
3. **Detail card** (`aria-live="polite"`) for the selected region: label, explanation,
   **"What to check:"** tip (if present), "Region confidence: N%" (if present), and "Approximate area, not
   an exact outline."
4. **General cues section** (§4).
5. **Honesty note:** "These areas show where to look, not proof that the image is fake. They are
   approximate, and real photos can show the same signs."

### 3.2 `ImageZoom.tsx` (extend, don't replace)

| Requirement | Why |
|---|---|
| Lift the selection out: add props `activeId` + `onActiveChange`, keeping today's internal state when they're omitted | So the panel list and the markers stay in sync |
| Let a parent trigger `zoomToFinding(id)` and a reset, e.g. via `forwardRef` + `useImperativeHandle` | So clicking a list item zooms the image |
| `showPanel` prop (default `true`) to hide the built-in explanation panel | The teachable panel replaces it, while other uses keep today's behaviour |
| Show the tip and confidence in the built-in panel when present | Cheap win if the full panel isn't built yet |
| Optional: hover tooltip on markers (mouse/pen only) with label + explanation | Quick preview without zooming |
| Optional: when zoomed in, select the region under the viewport center | Panning updates the explanation |

Keep `main`'s marker look: outline only, so the real image stays visible.

### 3.3 `Results.tsx`

Wrap the existing `<ImageZoom>` and the new panel in a two-column container for the preview area. Keep
`OnlineSearchPanel` and `ForensicsPanel` where they are. If there are no findings and no general cues,
render exactly what `main` renders today.

## 4. General-explanation fallback UI (needed with backend §7)

| Case | What to show |
|---|---|
| `findings` empty, `generalCues` present | Plain zoomable image (no markers) plus a **"What to look for in this image"** list. Each cue shows label, explanation, "What to check:" tip, and `appliesBecause` in a muted "Why this applies: …" line. |
| A few `findings` + `generalCues` | Region list and detail card as usual, then an **"Other things to check"** section with the general cues. |
| `partial` result (detection failed) with cues | Show the cues under the existing partial-result message, so the user still learns what to check. |
| `real` verdict with cues | A collapsible "What to check anyway" section, worded as guidance, not suspicion. |
| No findings and no cues | Exactly what `main` shows today. |

Honesty note for general cues: "These are common signs of AI-generated images that are worth checking
here. They are not specific detections in this image."

Some cues come from the forensics results (e.g. missing camera information). Consider linking such a
cue to the matching section of `ForensicsPanel`, so the user can see the evidence.

## 5. Accessibility and responsiveness checklist

- Markers and list items are real `<button>`s with `aria-label="Finding N: label"` and `aria-pressed`.
- Detail and explanation areas are `aria-live="polite"`.
- Zoom changes respect `prefers-reduced-motion`.
- Single column below 860px; on touch, rely on tap plus the list (no hover).
- Check with dark mode and large text (display settings), using the theme tokens in
  `frontend/src/styles/tokens.css`.

## 6. Acceptance tests (manual)

The backend needs `OPENROUTER_API_KEY`; there is no offline demo provider any more.

1. An image that comes back with regions shows numbered markers, a matching list, and a detail card.
   The tip and confidence appear when the model returned them.
2. Clicking a list item or a marker zooms in on that region and updates the detail card.
3. The method line shows `explanation_method`.
4. After the backend fallback ships: an image with no regions shows "What to look for in this image",
   with reasons that match the image (for example, a screenshot without camera data shows the
   missing-camera-information cue).
5. A partial result (detection failed) still shows the general cues.
6. History entries don't include findings or cues.
7. Online search and forensics panels behave as on `main`.
