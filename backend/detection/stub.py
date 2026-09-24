# detection/stub.py — stand-in until a pretrained model is wired

from __future__ import annotations

import hashlib
import time

from detection.base import DetectionError, DetectionResult


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

        if score >= 70:
            verdict, label = "fake", "Likely manipulated"
            summary = (
                "Our analysis found patterns that often appear in AI-generated or "
                "edited images. Treat this as a strong signal to verify the source."
            )
        elif score >= 40:
            verdict, label = "warn", "Possible manipulation detected"
            summary = (
                "Some signals were inconclusive. The image may be authentic or lightly "
                "edited — consider additional context before deciding."
            )
        else:
            verdict, label = "real", "No manipulation detected"
            summary = (
                "We did not find strong deepfake indicators in this image. "
                "This is not a guarantee of authenticity."
            )

        return DetectionResult(
            verdict=verdict,
            verdict_label=label,
            confidence=score if verdict != "real" else max(score, 55),
            summary=summary,
            provider=self.name,
        )
