# detection/face_landmarks.py — locate the main face so demo regions land on real features

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

# YuNet (OpenCV model zoo, MIT). ~230 KB, CPU-only, a few ms per image.
_MODEL_PATH = Path(__file__).resolve().parent / "models" / "face_detection_yunet_2023mar.onnx"
_SCORE_THRESHOLD = 0.6

_lock = threading.Lock()
_detector = None


@dataclass(frozen=True)
class FaceLandmarks:
    """Pixel coordinates in the EXIF-oriented image (what the browser shows)."""

    width: int
    height: int
    box: tuple[float, float, float, float]  # x, y, w, h
    right_eye: tuple[float, float]  # subject's right = image left
    left_eye: tuple[float, float]
    nose: tuple[float, float]
    mouth_right: tuple[float, float]
    mouth_left: tuple[float, float]


def detect_face(image_bytes: bytes) -> FaceLandmarks | None:
    """Return the most confident face, or None if there is none or no model file."""
    global _detector

    if not _MODEL_PATH.exists():
        return None

    # imdecode applies EXIF orientation, so coordinates match the browser preview
    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return None
    height, width = image.shape[:2]

    try:
        with _lock:
            if _detector is None:
                _detector = cv2.FaceDetectorYN.create(str(_MODEL_PATH), "", (width, height), _SCORE_THRESHOLD)
            _detector.setInputSize((width, height))
            _, faces = _detector.detect(image)
    except cv2.error:
        return None

    if faces is None or len(faces) == 0:
        return None

    row = max(faces, key=lambda f: f[14])
    point = lambda i: (float(row[i]), float(row[i + 1]))  # noqa: E731
    return FaceLandmarks(
        width=width,
        height=height,
        box=(float(row[0]), float(row[1]), float(row[2]), float(row[3])),
        right_eye=point(4),
        left_eye=point(6),
        nose=point(8),
        mouth_right=point(10),
        mouth_left=point(12),
    )
