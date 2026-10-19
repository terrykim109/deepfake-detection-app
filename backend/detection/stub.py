# detection/stub.py — stand-in until a pretrained model is wired

from __future__ import annotations

import hashlib
import time

from detection.base import (
    DEFAULT_SUMMARIES,
    DEFAULT_VERDICT_LABELS,
    DetectionError,
    DetectionResult,
)

# Simulated provider latency so the UI can show "analyzing"
LATENCY_SECONDS = 1.2


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

        time.sleep(LATENCY_SECONDS)

        digest = hashlib.sha256(image_bytes).hexdigest()
        score = int(digest[:8], 16) % 101

        if score >= 70:
            verdict = "fake"
        elif score >= 40:
            verdict = "warn"
        else:
            verdict = "real"

        return DetectionResult(
            verdict=verdict,
            verdict_label=DEFAULT_VERDICT_LABELS[verdict],
            confidence=score if verdict != "real" else max(score, 55),
            summary=DEFAULT_SUMMARIES[verdict],
            provider=self.name,
        )
