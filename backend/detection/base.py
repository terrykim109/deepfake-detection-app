# Shared types and interface for detection providers

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class DetectionResult:
    verdict: str  # real | warn | fake
    verdict_label: str
    confidence: int  # 0–100
    summary: str
    provider: str
    findings: list[dict[str, Any]] = field(default_factory=list)


class Detector(Protocol):
    """Interface for image detection providers"""

    name: str

    def analyze(self, *, image_bytes: bytes, filename: str | None,
        content_type: str | None,
    ) -> DetectionResult: ...


class DetectionError(Exception):
    """Raised when a detection provider cannot complete analysis"""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message
