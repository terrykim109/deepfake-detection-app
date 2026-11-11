# Teachable Feature — Backend Developer Handoff

Branch: `feat/teachable-explanations` (from `main` @ `52ad066`) · Last updated: 2026-11-10
Frontend work needed to use this backend: see [TEACHABLE_FRONTEND_REQUIREMENTS.md](TEACHABLE_FRONTEND_REQUIREMENTS.md).

## 1. TL;DR

- **What it is:** the backend part of the "teachable" feature. Along with the verdict, `/analysis/run`
  now returns **flagged regions** (`findings`). Each region has a box, an explanation, a "what to check"
  tip and a per-region confidence. The response also says how the regions were produced
  (`explanation_method`). The aim is to *teach* users where and how to look at an image, not just give
  a verdict.
- **Status:** working for both providers (`stub` and `openrouter`). Backend tests pass
  (`detection/tests`, 24/24). **This branch contains backend changes only.** The UI that displays the
  regions is specified separately (see the link above).
- **Most important caveat:** the regions are **not real model explainability** yet.
  - `stub` provider: 4 hard-coded teaching cues (eye / jaw / mouth / hair), placed on a face that OpenCV
    YuNet finds, picked deterministically from the image hash.
  - `openrouter` provider: the boxes are *guessed by vision LLMs* in their JSON reply, so they're approximate.
- **Main missing requirement:** the **general-explanation fallback** (§7). When nothing or very little can
  be extracted from the image, the API must still return teaching content about common AI
  characteristics that fits the analyzed image.

## 2. Commits on this branch

1. Backend: region findings with tips, per-region confidence and explanation method
2. Backend: tests for findings parsing and stub regions
3. Docs: this handoff and the frontend requirements

## 3. Data flow

```
Upload → POST /analysis/run                     backend/routers/analysis.py
  → get_detector()                              backend/detection/__init__.py  (DETECTION_PROVIDER=stub|openrouter)
     ├─ StubDetector.analyze()                  backend/detection/stub.py
     │     → detect_face()                      backend/detection/face_landmarks.py (YuNet ONNX)
     │     → _stub_findings()                   demo cues positioned on face landmarks
     └─ OpenRouterEnsembleDetector.analyze()    backend/detection/openrouter.py
           → LLM JSON → _parse_findings() → _combine()
  → DetectionResult{verdict, confidence, summary, findings[], explanation_method}   backend/detection/base.py
  → response JSON: result.findings, result.explanation_method
```

### API contract (`POST /api/analysis/run` → `result`)

New or changed fields only. Existing fields (`verdict`, `verdict_label`, `confidence`, `summary`,
`provider`, …) are unchanged.

```json
{
  "findings": [
    {
      "id": "f1",
      "label": "Eye asymmetry",
      "explanation": "≤ 280 chars, tentative wording",
      "tip": "≤ 200 chars (optional)",
      "confidence": 72,
      "x": 0.31, "y": 0.28, "w": 0.12, "h": 0.07
    }
  ],
  "explanation_method": "mock regions placed on the detected face"
}
```

- `findings` is `[]` for a `real` verdict. There are at most 4. `id` values are `f1`, `f2`, … in rank order.
- `x, y` is the top-left corner. `x, y, w, h` are normalized 0–1 against the **EXIF-oriented** image
  (what a browser displays), and are clipped so the box stays inside the image.
- `tip` and `confidence` (0–100, how suspicious that region is) are optional; any provider may omit them.
- `explanation_method` is meant to be shown to users. It is `""` when there are no findings. Current values:
  - `"mock regions placed on the detected face"` (stub, face found)
  - `"mock regions (no face found, approximate layout)"` (stub, no face)
  - `"AI vision model description (approximate areas)"` (openrouter)

## 4. What was built

| File | What it does |
|---|---|
| `backend/detection/base.py` | Adds `DetectionResult.explanation_method: str = ""`. |
| `backend/config.py` | Adds the `STUB_DEMO_VERDICT` env var (`fake` / `warn` / `real`), which forces the stub's verdict for demos. Empty means the normal hash-based verdict. |
| `backend/detection/face_landmarks.py` (new) | `detect_face(bytes) -> FaceLandmarks or None`, using `cv2.FaceDetectorYN` and the YuNet model. Returns the face box and 5 landmarks (both eyes, nose, both mouth corners) in pixels, plus image width/height. Lazy singleton behind a lock. Returns `None` when the model file is missing, the image can't be decoded, or no face scores ≥ 0.6. |
| `backend/detection/models/face_detection_yunet_2023mar.onnx` (new) | YuNet face detector from the OpenCV model zoo (MIT, ~230 KB, CPU, a few ms per image). If it's missing, face detection quietly returns `None`. |
| `backend/detection/stub.py` | `_REGIONS` holds the 4 teaching cues (label / explanation / tip / fallback box). `_region_box()` sizes each box from the landmarks, and `_normalized()` clips it to the image. `_stub_findings()` orders cues using bytes of the image hash: 4 cues for `fake`, 3 for `warn`, 0 for `real`. Region confidence = verdict confidence − 10 − 6·rank ± jitter, clamped to 30–95. **With no face it uses fixed boxes that assume a centered portrait** (see §6.1). `_verdict_and_confidence()` applies `STUB_DEMO_VERDICT`. Face detection only runs for `warn` / `fake`. |
| `backend/detection/openrouter.py` | The prompt now asks for a `tip` and a per-finding `confidence`; max findings went from 3 to 4. `_coord_scale()` detects models that answer in 0–1000 (despite the prompt) and rescales the whole response. `_region_confidence()` accepts 0–1 or 0–100. Malformed optional fields are dropped without discarding the finding. Sets `explanation_method` when findings exist. |
| `backend/routers/analysis.py` | Adds `explanation_method` to the `/analysis/run` response. |
| `backend/detection/tests/test_findings.py` (new) | 24 tests. Parser: 0–1 pass-through, 0–1000 rescaling, clipping, degenerate inputs, cap of 4, optional `tip` / `confidence`. Stub: determinism, no-face fallback layout, forced verdicts, placement on a real face (skipped if the model file is missing), and stub output surviving the parser unchanged. An autouse fixture clears `STUB_DEMO_VERDICT` so a local `.env` can't change results. |

Dependencies (`opencv-python-headless`, `numpy`) are already in `backend/requirements.txt`.

## 5. Running and testing

```bash
cd backend
venv\Scripts\activate
uvicorn main:app --reload
python -m pytest detection/tests        # 24 passed
```

- Demo mode: in `backend/.env` set `DETECTION_PROVIDER=stub` and `STUB_DEMO_VERDICT=fake` (or `warn`) so
  findings are always returned. A frontal face photo such as
  `backend/ml/model_1/sample_image_deepfake.jpg` gets face-placed regions.
- Live mode: `DETECTION_PROVIDER=openrouter` with `OPENROUTER_API_KEY` set.
- Without a UI, call `POST /api/analysis/run` (authenticated, like the existing upload flow) and look at
  `result.findings` / `result.explanation_method`.

## 6. Known issues

1. **No face → misleading boxes.** Without a face, the stub returns fixed "centered portrait" boxes for
   any image (landscapes, objects, groups). Replace this with the fallback in §7.
2. **OpenRouter boxes are imprecise.** The LLMs estimate the coordinates, and the ensemble `_combine()`
   keeps one model's findings. Models often return `[]` or invalid boxes, and the parser drops those, so
   `warn` / `fake` results with zero findings are common. This is another reason for §7.
3. **There is no real saliency / heatmap data.** Any heatmap the UI draws can only be derived from the boxes.
4. **Findings aren't persisted.** They exist only in the `/analysis/run` response. History stores
   metadata only, in line with the image-deletion privacy promise.

## 7. TO DO — General-explanation fallback (required)

**Goal:** the API always returns teaching content. When the detector gives **no findings**, **only
1–2**, or findings with no `tip`, return general explanations of common AI-generation characteristics.
Pick them so they **still fit the analyzed image**, rather than returning a fixed generic list.

### When it should trigger

- A `warn` / `fake` verdict with 0 findings (common with OpenRouter, see §6.2).
- The stub finds no face. This replaces the fixed portrait boxes in §6.1.
- Fewer than about 2 findings: top up with general cues.
- A `real` verdict: optionally return "what to check anyway" cues, worded as guidance, not suspicion.

### Suggested design

**Contract:** add `general_cues` to `DetectionResult` (`base.py`) and to the response in
`routers/analysis.py`, next to `explanation_method`:

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

**New module `backend/detection/general_cues.py`:** a catalogue of common AI characteristics. Each entry
has a condition evaluated against the image:

- **A face is found** (reuse `face_landmarks.detect_face`): eyes and catchlights, teeth, skin that is too
  smooth, ears or earrings that don't match, the hairline.
- **No face:** background coherence, repeated textures, warped straight lines or architecture, garbled
  text or signage, hands / fingers when people are present, inconsistent shadows or lighting.
- **Signals the forensics engine already computes** (`backend/forensics/`, `run_forensics()`):
  - `metadata` (`extract_metadata`): no `camera_make` / `camera_model`, or a `software` tag naming an
    editor or generator → "missing camera information" cue.
  - `c2pa` (`check_c2pa`): `claim_generator` names a generator tool → a cue that cites it.
  - `noise` (`analyze_noise`): uniform block variance or a high `outlier_block_count` → "unnaturally
    even noise" cue.
  - `ela` (`generate_ela`): uneven error levels → "regions compressed differently" cue.
  - Dimensions (`metadata.file_info`): square, or a typical generator resolution (512 / 768 / 1024) →
    mild cue.
- Pick 3–4 cues, ranked by how many conditions match. Always return at least 2 for `warn` / `fake`.
- When general cues are the only explanation, set `explanation_method` to something like
  `"general guidance (no specific regions found)"`.

**Keep it provider-independent:** call it once in `routers/analysis.py` after `detector.analyze()`, so
the stub, OpenRouter and any future provider all get it. Change the stub's no-face path to return no boxes
(`findings=[]`) and let the fallback cover that case. Wrap the forensics calls like `run_forensics()`
already does, so a failing signal skips its cue instead of failing the analysis.

**Tests:** cue selection for face / no-face / missing-metadata / C2PA inputs; `analysis.py` returns
`general_cues` when findings are empty; the stub's no-face path returns no boxes. Update
`test_stub_without_face_uses_fallback_layout`, which currently expects the portrait fallback boxes.

## 8. Further work (after the fallback)

1. **Real explainability:** `backend/ml/model_1/` contains a CLIP ViT-L/14 deepfake classifier
   (`pretrained_weights/fc_weights.pth`, see `test_inference.py`) that `get_detector()` doesn't use yet.
   Add a `clip` provider that implements the `Detector` protocol (`base.py`), derive regions with
   Grad-CAM or attention rollout over the ViT patches, convert them to boxes, and emit the same finding
   contract with a matching `explanation_method` (e.g. `"Grad-CAM on CLIP ViT-L/14"`). Optionally return a
   low-res saliency grid (e.g. 16×16 floats) so the UI can draw a real heatmap.
2. **Labels for model-derived regions:** match each region against the face landmarks to reuse the
   label / explanation / tip text from `stub._REGIONS`.
3. **Keep the contract stable:** a new provider only has to fill `findings`, `general_cues` and
   `explanation_method`.

## 9. Design decisions to keep

- **Honesty first:** regions are cues, not proof. `explanation_method` is shown to users, and a UI may
  check for the word "mock" to adjust its wording, so keep "mock" in the stub's method strings.
- **Coordinates** are normalized 0–1 against the EXIF-rotated image (OpenCV `imdecode` applies EXIF
  orientation the same way the browser does).
- **Deterministic stub:** output is seeded by the image hash, so the same image gives the same demo.
- **Forgiving parser:** bad findings are dropped instead of failing the whole analysis.
