from config import DETECTION_PROVIDER
from detection.base import Detector, DetectionError, DetectionResult

def get_detector() -> Detector:
    """
    Return the active detector implementation. OpenRouter requires OPENROUTER_API_KEY in the environment
    """
    provider_name = (DETECTION_PROVIDER or "").strip().lower() or "openrouter"

    if provider_name in {"openrouter", "or", "ensemble"}:
         from detection.openrouter import OpenRouterEnsembleDetector
         
         return OpenRouterEnsembleDetector()

    raise ValueError(f"Unsupported DETECTION_PROVIDER: {provider_name!r}. " 
                     "Expected 'openrouter', 'or', or 'ensemble'.")

__all__ = [ "Detector", "DetectionError", "DetectionResult", "get_detector" ]
