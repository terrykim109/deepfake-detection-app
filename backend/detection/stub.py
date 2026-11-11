# detection/stub.py — stand-in until a pretrained model is wired

from __future__ import annotations

import hashlib
import math
import time

from config import STUB_DEMO_VERDICT
from detection.base import DetectionError, DetectionResult
from detection.face_landmarks import FaceLandmarks, detect_face

_VERDICT_LABELS = {
    "fake": "Likely manipulated",
    "warn": "Possible manipulation detected",
    "real": "No manipulation detected",
}

_SUMMARIES = {
    "fake": (
        "Our analysis found patterns that often appear in AI-generated or "
        "edited images. Treat this as a strong signal to verify the source."
    ),
    "warn": (
        "Some signals were inconclusive. The image may be authentic or lightly "
        "edited — consider additional context before deciding."
    ),
    "real": (
        "We did not find strong deepfake indicators in this image. "
        "This is not a guarantee of authenticity."
    ),
}

# Demo region cues for warn/fake results. When a face is found, each box is
# placed from its landmarks; otherwise the fallback box assumes a centered
# portrait. The cues are illustrative teaching examples, not model output.
_REGIONS = {
    "eye": {
        "label": "Eye asymmetry",
        "explanation": (
            "The two eyes may differ slightly in size, shape, or catchlights (the small "
            "reflections of light). Generated faces often get these details out of sync."
        ),
        "tip": "Zoom in and compare both eyes. Do the reflections sit in the same spot?",
        "fallback": (0.34, 0.30, 0.14, 0.08),
    },
    "jaw": {
        "label": "Blending seam along the jawline",
        "explanation": (
            "Face swaps often leave a soft seam or unnatural smoothing where the "
            "generated face meets the original skin, neck, or hair."
        ),
        "tip": "Look for a faint edge, a change in skin texture, or lighting that stops at the jaw.",
        "fallback": (0.30, 0.58, 0.40, 0.12),
    },
    "mouth": {
        "label": "Teeth and lip detail",
        "explanation": (
            "Generators struggle with teeth and lip edges: teeth can merge into one "
            "block, and the lip outline may blur or change sharpness."
        ),
        "tip": "Check whether individual teeth are distinct and the lip edge stays sharp all the way around.",
        "fallback": (0.40, 0.48, 0.20, 0.08),
    },
    "hair": {
        "label": "Hair strand artifacts",
        "explanation": (
            "Fine hair is hard to synthesize. Strands may melt into the background, "
            "repeat, or end abruptly near the hairline."
        ),
        "tip": "Follow a few strands at the hairline. Do they continue naturally into the background?",
        "fallback": (0.30, 0.08, 0.40, 0.12),
    },
}

_REGION_COUNT = {"fake": 4, "warn": 3}

METHOD_FACE = "mock regions placed on the detected face"
METHOD_NO_FACE = "mock regions (no face found, approximate layout)"


def _region_box(key: str, face: FaceLandmarks) -> tuple[float, float, float, float]:
    """Pixel box for one cue, sized from the face so it scales with the image."""
    fx, fy, fw, fh = face.box
    eye_gap = math.dist(face.right_eye, face.left_eye) or fw * 0.4

    if key == "eye":
        ex, ey = face.right_eye
        w, h = eye_gap * 0.75, eye_gap * 0.45
        return ex - w / 2, ey - h / 2, w, h
    if key == "mouth":
        (rx, ry), (lx, ly) = face.mouth_right, face.mouth_left
        w = max(abs(lx - rx) * 1.5, eye_gap * 0.6)
        h = eye_gap * 0.5
        return (rx + lx) / 2 - w / 2, (ry + ly) / 2 - h / 2, w, h
    if key == "jaw":
        # Band from just below the mouth to slightly past the chin
        mouth_y = (face.mouth_right[1] + face.mouth_left[1]) / 2
        top = mouth_y + eye_gap * 0.35
        return fx + fw * 0.1, top, fw * 0.8, fy + fh * 1.06 - top
    # hair: band across the hairline at the top of the face box
    return fx + fw * 0.1, fy - fh * 0.1, fw * 0.8, fh * 0.2


def _normalized(box, width: int, height: int) -> tuple[float, float, float, float] | None:
    x, y, w, h = box
    x0, y0 = max(x / width, 0.0), max(y / height, 0.0)
    x1, y1 = min((x + w) / width, 1.0), min((y + h) / height, 1.0)
    if x1 - x0 <= 0.005 or y1 - y0 <= 0.005:
        return None
    return x0, y0, x1 - x0, y1 - y0


def _stub_findings(
    digest: str,
    verdict: str,
    confidence: int,
    face: FaceLandmarks | None,
) -> list[dict]:
    """Pick demo findings, seeded by the image hash so results repeat."""
    count = _REGION_COUNT.get(verdict, 0)
    if not count:
        return []

    seed = bytes.fromhex(digest)
    order = sorted(_REGIONS, key=lambda k: (seed[5 + list(_REGIONS).index(k)], k))

    findings = []
    for key in order:
        if len(findings) >= count:
            break
        region = _REGIONS[key]
        box = (
            _normalized(_region_box(key, face), face.width, face.height)
            if face
            else region["fallback"]
        )
        if box is None:
            continue
        rank = len(findings)
        jitter = seed[12 + rank] % 7 - 3
        findings.append(
            {
                "id": f"f{rank + 1}",
                "label": region["label"],
                "explanation": region["explanation"],
                "tip": region["tip"],
                "confidence": max(30, min(95, confidence - 10 - 6 * rank + jitter)),
                "x": round(box[0], 4),
                "y": round(box[1], 4),
                "w": round(box[2], 4),
                "h": round(box[3], 4),
            }
        )
    return findings


def _verdict_and_confidence(score: int) -> tuple[str, int]:
    """Hash-based verdict, or a fixed one when STUB_DEMO_VERDICT is set."""
    forced = STUB_DEMO_VERDICT if STUB_DEMO_VERDICT in _VERDICT_LABELS else None

    if forced == "fake" or (not forced and score >= 70):
        return "fake", score if score >= 70 else 75 + score % 21
    if forced == "warn" or (not forced and score >= 40):
        return "warn", score if 40 <= score < 70 else 45 + score % 20
    return "real", max(score, 55)


class StubDetector:
    """
    Deterministic local detector for end-to-end wiring.

    Replace with SightEngine / Hugging Face / custom PyTorch model via
    DETECTION_PROVIDER without changing the /analysis/run contract.
    """

    name = "stub"

    def analyze(
        self,
        *,
        image_bytes: bytes,
        filename: str | None,
        content_type: str | None,
    ) -> DetectionResult:
        if not image_bytes:
            raise DetectionError(
                "The analysis service could not read that image. Please try uploading again."
            )

        # Simulate provider latency so the UI can show "analyzing"
        time.sleep(1.2)

        digest = hashlib.sha256(image_bytes).hexdigest()
        score = int(digest[:8], 16) % 101
        verdict, confidence = _verdict_and_confidence(score)

        face = detect_face(image_bytes) if verdict != "real" else None
        findings = _stub_findings(digest, verdict, confidence, face)

        return DetectionResult(
            verdict=verdict,
            verdict_label=_VERDICT_LABELS[verdict],
            confidence=confidence,
            summary=_SUMMARIES[verdict],
            provider=self.name,
            findings=findings,
            explanation_method=(METHOD_FACE if face else METHOD_NO_FACE) if findings else "",
        )
