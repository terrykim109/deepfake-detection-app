# detection/__init__.py — resolve the configured detection provider

from config import DETECTION_PROVIDER
from detection.base import Detector, DetectionError, DetectionResult
from detection.stub import StubDetector


def get_detector() -> Detector:
    """
    Return the active detector implementation.

    Today: stub (local heuristic) so the upload→backend→result path works.
    Later: switch DETECTION_PROVIDER to a pretrained model adapter.
    """
    provider = (DETECTION_PROVIDER or "stub").strip().lower()
    if provider in {"stub", "mock", "local"}:
        return StubDetector()

    # Unknown providers fall back to stub so demos keep working
    return StubDetector()


__all__ = [
    "Detector",
    "DetectionError",
    "DetectionResult",
    "get_detector",
]
