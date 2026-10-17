# detection/__init__.py — resolve the configured detection provider

from config import DETECTION_PROVIDER
from detection.base import Detector, DetectionError, DetectionResult
from detection.stub import StubDetector


def get_detector() -> Detector:
    """
    Return the active detector implementation.

    Set DETECTION_PROVIDER=openrouter (default) or stub.
    OpenRouter requires OPENROUTER_API_KEY in the environment
    (checked when analyze() runs).
    """
    provider = (DETECTION_PROVIDER or "stub").strip().lower()
    if provider in {"stub", "mock", "local"}:
        return StubDetector()

    if provider in {"openrouter", "or", "ensemble"}:
        from detection.openrouter import OpenRouterEnsembleDetector

        return OpenRouterEnsembleDetector()

    # Unknown providers fall back to stub so demos keep working
    return StubDetector()


__all__ = [
    "Detector",
    "DetectionError",
    "DetectionResult",
    "get_detector",
]
