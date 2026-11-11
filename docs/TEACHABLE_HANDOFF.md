# Teachable Feature — Backend Developer Handoff

Branch: `feat/teachable-explanations` (up to date with `main` @ `703f571`) · Last updated: 2026-11-10
Frontend work needed to use this backend: see [TEACHABLE_FRONTEND_REQUIREMENTS.md](TEACHABLE_FRONTEND_REQUIREMENTS.md).

## 1. TL;DR

- **What it is:** the backend part of the "teachable" feature. Along with the verdict, `/analysis/run`
  returns **flagged regions** (`findings`). Each region has a box, an explanation, and now a "what to
  check" **tip** and a per-region **confidence**. The response also returns `explanation_method`, which
  says how the regions were produced. The aim is to *teach* users where and how to look at an image,
  not just give a verdict.
- **Status:** the OpenRouter provider returns the enriched findings. Detection tests pass
  (`detection/tests`, 27/27). This branch has **backend changes and docs only**. The frontend is
  identical to `main`.
- **Most important caveat:** the regions are **not real model explainability**. The vision LLMs in the
  OpenRouter ensemble *estimate* the boxes in their JSON reply, so they are approximate and often missing.
- **Main missing requirement:** the **general-explanation fallback** (§7). When nothing or very little can
  be extracted from the image, the API must still return teaching content about common AI
  characteristics that fits the analyzed image.

## 2. What this branch changes compared with `main`

| File | Change |
|---|---|
| `backend/detection/base.py` | Adds `DetectionResult.explanation_method: str = ""`. |
| `backend/detection/openrouter.py` | Prompt asks each finding for an optional `tip` and region `confidence`, listed **after** `x,y,w,h` so main's truncated-JSON recovery still matches. `_recover_findings_objects()` also picks up the optional `tip` / `confidence`. Coordinates use one scale per response via `_coord_scale()` (0–1, 0–100 or 0–1000, chosen from the largest value). This replaces main's per-value `_norm_coord()`, which could mis-scale a reply that mixed small and large numbers. `_region_confidence()` accepts 0–1 or 0–100 and drops anything else. `_combine()` sets `explanation_method = "AI vision model description (approximate areas)"` when findings exist. `_MAX_FINDINGS` stays at main's **3**. |
| `backend/routers/analysis.py` | Adds `explanation_method` to `result` in the `/analysis/run` response (one line). |
| `backend/detection/face_landmarks.py` (new) | `detect_face(bytes) -> FaceLandmarks or None`, using OpenCV `FaceDetectorYN`. Returns the face box and 5 landmarks (both eyes, nose, both mouth corners) in pixels, plus image width/height. Lazy singleton behind a lock. Returns `None` when the model file is missing, the image can't be decoded, or no face scores ≥ 0.6. **Nothing calls it yet.** It's here for the fallback in §7. |
| `backend/detection/models/face_detection_yunet_2023mar.onnx` (new) | YuNet face detector from the OpenCV model zoo (MIT, ~230 KB, CPU, a few ms per image). |
| `backend/detection/tests/test_findings.py` (new) | 27 tests. Region parsing: 0–1 / 0–100 / 0–1000 scaling, one scale per response, clipping, degenerate input, cap, optional `tip` / `confidence`. Truncated replies, with and without the new fields. `detect_face`: undecodable bytes, a blank image, a missing model file, and a real face (`backend/Sample photos/sample_deepfake.jpg`). |

`opencv-python-headless` and `numpy` are already in `backend/requirements.txt` on `main`.

**Removed during the merge with `main`:** `main` deleted the stub detector (`detection/stub.py`) and the
CLIP model folder (`backend/ml/`). This branch follows that. The stub-based demo regions and the
`STUB_DEMO_VERDICT` setting are gone, and **OpenRouter is the only provider**. The stub's teaching-cue
text is kept in §7.3 as starter content for the fallback.

## 3. Data flow

```
Upload → POST /api/analysis/run                 backend/routers/analysis.py
  asyncio.gather(
    detection    → get_detector() → OpenRouterEnsembleDetector.analyze()   backend/detection/openrouter.py
                     per model: LLM JSON → _extract_json() → _parse_findings()
                     → _combine(): median verdict/confidence, _pick_findings(), explanation_method
    online search → reverse_search.py
    forensics     → run_forensics()  (metadata, ELA, noise, C2PA)            backend/forensics/
  )
  → response: result{…, findings[], explanation_method}, forensics{…}, online_search{…}
```

If detection fails but search or forensics succeed, the response is `status: "partial"` and
`result` is `null`.

### API contract (`result` in the `POST /api/analysis/run` response)

Teachable fields only; other fields are unchanged from `main`.

```json
{
  "findings": [
    {
      "id": "f1",
      "label": "Eye asymmetry",
      "explanation": "≤ 280 chars, tentative wording",
      "x": 0.31, "y": 0.28, "w": 0.12, "h": 0.07,
      "tip": "≤ 200 chars (optional, new)",
      "confidence": 72
    }
  ],
  "explanation_method": "AI vision model description (approximate areas)"
}
```

- At most 3 findings, `id` = `f1`, `f2`, … Boxes narrower or shorter than 1% of the image are dropped.
- `x, y` is the top-left corner. `x, y, w, h` are normalized 0–1 to the full image and clipped so the box
  stays inside it.
- `tip` and `confidence` (0–100, how suspicious that region is) are **optional**; models often leave them
  out.
- `findings` is `[]` when every model agreed the image looks real (main's `_combine()` rule).
- `explanation_method` is meant to be shown to users. It is `""` when there are no findings.

## 4. Running and testing

```bash
cd backend
venv\Scripts\activate
uvicorn main:app --reload
python -m pytest detection/tests      # 27 passed
```

- An `OPENROUTER_API_KEY` in `backend/.env` is required; there is no offline provider any more.
- Without a UI, call `POST /api/analysis/run` (authenticated, like the existing upload flow) and look at
  `result.findings` / `result.explanation_method`.
- `backend/test_openrouter_models.py` is a manual script that calls the live models. Don't let pytest
  collect it: run `pytest detection/tests routers/tests tests forensics/tests` rather than bare `pytest`.
- **Already failing on `main`, not caused by this branch:** 11 forensics tests (`forensics/tests/*`,
  `routers/tests/test_forensics.py`) still load sample images from `backend/ml/model_1/`, which `main`
  deleted. They fail with `FileNotFoundError`. Point them at `backend/Sample photos/` to fix them.

## 5. Known issues

1. **Findings are often missing.** Free vision models frequently return `[]`, unusable boxes, or JSON
   that gets cut off. `warn` / `fake` results with zero findings are common, which is the main reason for §7.
2. **Boxes are imprecise.** The models estimate them, and `_pick_findings()` keeps one model's findings.
3. **`tip` / `confidence` are best-effort.** Many models ignore the optional fields.
4. **No saliency or heatmap data.** Anything the UI draws can only come from the boxes.
5. **Findings aren't persisted.** They exist only in the `/analysis/run` response. History stores
   metadata only, in line with the image-deletion privacy promise.

## 6. Design decisions to keep

- **Honesty first:** regions and cues are hints, not proof. `explanation_method` is shown to users.
- **Coordinates** are normalized 0–1 against the image as displayed (OpenCV `imdecode` applies EXIF
  orientation, so `face_landmarks` matches the browser).
- **Forgiving parser:** bad findings and malformed optional fields are dropped instead of failing the
  analysis.
- **Keep the contract stable:** any future provider only has to fill `findings`, `general_cues` and
  `explanation_method`.

## 7. TO DO — General-explanation fallback (required)

**Goal:** the API always returns teaching content. When detection gives **no findings**, **only 1–2**,
or findings with no `tip`, return general explanations of common AI-generation characteristics. Pick
them so they **still fit the analyzed image**, rather than returning a fixed generic list.

### 7.1 When it should trigger

- A `warn` / `fake` verdict with 0 findings (common, see §5.1).
- Fewer than about 2 findings: top up with general cues.
- `status: "partial"` (detection failed but forensics succeeded): the cues can still teach the user what
  to look for.
- A `real` verdict: optionally return "what to check anyway" cues, worded as guidance, not suspicion.

### 7.2 Suggested design

**Contract:** add `general_cues` to the `result` object in `routers/analysis.py`. Optionally add it to
`DetectionResult` in `base.py` too, if a provider should ever supply its own.

```json
"general_cues": [
  {
    "id": "g1",
    "label": "Missing camera information",
    "explanation": "AI-generated images usually have no camera make, model or capture date.",
    "tip": "Ask the source for the original file, or check whether other copies carry camera data.",
    "applies_because": "No camera information was found in this file."
  }
]
```

These cues have **no coordinates**. `applies_because` tells the user why the cue fits *this* image.

**New module `backend/detection/general_cues.py`:**
`select_general_cues(image_bytes, forensics, findings, verdict) -> list[dict]`. It holds a catalogue
of common AI characteristics, each with a condition evaluated against the image:

- **Forensics results**: `routers/analysis.py` already gets `forensics_out` from
  `asyncio.gather(...)`, so pass that in rather than running forensics again:
  - `metadata` (`extract_metadata`): no `camera_make` / `camera_model` / `date_taken`, or a `software`
    tag naming an editor or generator → "missing camera information" cue.
  - `c2pa` (`check_c2pa`): `found` with a `claim_generator` naming a generator tool → a cue that cites it.
  - `noise` (`analyze_noise`): low `std_block_variance` or a high `outlier_block_count` →
    "unnaturally even noise" cue.
  - `ela` (`generate_ela`): uneven error levels → "regions compressed differently" cue.
  - Dimensions (`metadata.file_info`): square, or a typical generator size (512 / 768 / 1024) → mild cue.
- **A face is found** (`face_landmarks.detect_face(image_bytes)`, fast and already on this branch):
  face-specific cues (§7.3).
- **No face found:** scene cues such as background coherence, repeated textures, warped straight lines
  or architecture, garbled text or signage, hands / fingers when people are present, and inconsistent
  shadows or lighting.
- Pick 3–4 cues, ranked by how many conditions match, and skip any whose topic is already covered by a
  model finding. Always return at least 2 for `warn` / `fake`.
- When general cues are the only explanation, set `explanation_method` to something like
  `"general guidance (no specific regions found)"`.

**Wiring:** call it once in `routers/analysis.py` after the `gather`, for both the success and the
`partial` path. Treat each forensics section as optional, like `run_forensics()` does, so a failing
signal skips its cue instead of failing the analysis. Add the module to the response in both places.

### 7.3 Starter content: face cues (from the removed stub)

| Cue | Explanation | What to check |
|---|---|---|
| Eye asymmetry | The two eyes may differ slightly in size, shape, or catchlights (the small reflections of light). Generated faces often get these details out of sync. | Zoom in and compare both eyes. Do the reflections sit in the same spot? |
| Blending seam along the jawline | Face swaps often leave a soft seam or unnatural smoothing where the generated face meets the original skin, neck, or hair. | Look for a faint edge, a change in skin texture, or lighting that stops at the jaw. |
| Teeth and lip detail | Generators struggle with teeth and lip edges: teeth can merge into one block, and the lip outline may blur or change sharpness. | Check whether individual teeth are distinct and the lip edge stays sharp all the way around. |
| Hair strand artifacts | Fine hair is hard to synthesize. Strands may melt into the background, repeat, or end abruptly near the hairline. | Follow a few strands at the hairline. Do they continue naturally into the background? |

If you want **located** face cues, the removed stub sized boxes from the landmarks as follows
(`eye_gap` = distance between the eyes):
- **eye:** centered on `right_eye`, 0.75 × 0.45 · `eye_gap`.
- **mouth:** centered between the mouth corners, width max(1.5 × mouth width, 0.6 · `eye_gap`),
  height 0.5 · `eye_gap`.
- **jaw:** from 0.35 · `eye_gap` below the mouth to 1.06 × face height, 80% of face width.
- **hair:** a band 20% of face height tall, starting 10% above the face box.

The full code is in this branch's history: `git show 998f50b:backend/detection/stub.py`.

### 7.4 Tests to add

Cue selection for face / no-face / missing-metadata / C2PA / forensics-failed inputs; `analysis.py`
returns `general_cues` when findings are empty and on the `partial` path; no duplicate topics between
findings and cues.

## 8. Further work (after the fallback)

1. **Real explainability:** to get model-derived regions instead of LLM guesses, add a provider that
   implements the `Detector` protocol (`base.py`) with a local classifier. Derive regions with Grad-CAM or
   attention rollout and emit the same finding contract with a matching `explanation_method`. Note that
   `main` removed the earlier CLIP experiment (`backend/ml/`), so check with the team on model choice and
   whether it can be hosted (Vercel limits).
2. **Real heatmap:** optionally return a low-res saliency grid (e.g. 16×16 floats) from such a provider.
3. Fix the 11 pre-existing forensics test failures (§4).
