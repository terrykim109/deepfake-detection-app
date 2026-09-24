# detection/base.py — pluggable deepfake detection providers

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


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

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message
