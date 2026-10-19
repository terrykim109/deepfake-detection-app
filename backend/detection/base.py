# detection/base.py — pluggable deepfake detection providers

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol

VERDICTS = ("real", "warn", "fake")

# Spellings a provider adapter may return for a supported result state
_VERDICT_ALIASES = {
    "inconclusive": "warn",
    "uncertain": "warn",
    "authentic": "real",
    "manipulated": "fake",
}

DEFAULT_VERDICT_LABELS = {
    "fake": "Likely manipulated",
    "warn": "Possible manipulation detected",
    "real": "No manipulation detected",
}

DEFAULT_SUMMARIES = {
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

UNUSABLE_RESULT_MESSAGE = "The analysis service returned a result we could not use."


@dataclass
class DetectionResult:
    verdict: str  # real | warn | fake
    verdict_label: str
    confidence: int  # 0–100
    summary: str
    provider: str


class Detector(Protocol):
    """Backend detection adapter. Swap stub for a pretrained model later."""

    name: str

    def analyze(
        self,
        *,
        image_bytes: bytes,
        filename: str | None,
        content_type: str | None,
    ) -> DetectionResult: ...


class DetectionError(Exception):
    """Raised when the configured provider cannot complete analysis."""

    def __init__(self, message: str, reason: str | None = None):
        super().__init__(message)
        self.message = message  # plain-language, safe to show the user
        self.reason = reason or message  # internal detail for audit logs


def validate_detection_output(raw: Any, *, provider: str) -> DetectionResult:
    """
    Check a detector's output against the result contract before it reaches
    the client. Raises DetectionError for null, malformed, or unsupported
    output so the router treats it as a failed analysis.

    Confidence must already be a 0–100 percentage; adapters that produce a
    0–1 probability scale it themselves.
    """
    if raw is None:
        raise DetectionError(UNUSABLE_RESULT_MESSAGE, "detector returned no result")

    if isinstance(raw, DetectionResult):
        fields: Mapping[str, Any] = vars(raw)
    elif isinstance(raw, Mapping):
        fields = raw
    else:
        raise DetectionError(
            UNUSABLE_RESULT_MESSAGE, f"unexpected result type {type(raw).__name__}"
        )

    verdict = fields.get("verdict")
    if not isinstance(verdict, str) or not verdict.strip():
        raise DetectionError(UNUSABLE_RESULT_MESSAGE, f"missing verdict: {verdict!r}")
    verdict = verdict.strip().lower()
    verdict = _VERDICT_ALIASES.get(verdict, verdict)
    if verdict not in VERDICTS:
        raise DetectionError(UNUSABLE_RESULT_MESSAGE, f"unsupported verdict: {verdict!r}")

    confidence = fields.get("confidence")
    # bool is an int subclass; True/False is never a valid score
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        raise DetectionError(UNUSABLE_RESULT_MESSAGE, f"non-numeric confidence: {confidence!r}")
    if not math.isfinite(confidence) or not 0 <= confidence <= 100:
        raise DetectionError(UNUSABLE_RESULT_MESSAGE, f"confidence out of range: {confidence!r}")

    label = fields.get("verdict_label")
    if not isinstance(label, str) or not label.strip():
        label = DEFAULT_VERDICT_LABELS[verdict]

    summary = fields.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        summary = DEFAULT_SUMMARIES[verdict]

    result_provider = fields.get("provider")
    if not isinstance(result_provider, str) or not result_provider.strip():
        result_provider = provider

    return DetectionResult(
        verdict=verdict,
        verdict_label=label.strip(),
        confidence=int(round(confidence)),
        summary=summary.strip(),
        provider=result_provider.strip(),
    )
