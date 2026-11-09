from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np

BLOCK_SIZE = 16


def _gradient_magnitude(image_bytes: bytes) -> np.ndarray:
    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image bytes")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    return cv2.magnitude(gx, gy)


def _block_grid(magnitude: np.ndarray) -> np.ndarray:
    """Per-BLOCK_SIZE-block mean gradient magnitude."""
    height, width = magnitude.shape
    rows = max(height // BLOCK_SIZE, 1)
    cols = max(width // BLOCK_SIZE, 1)

    block_density = np.zeros((rows, cols), dtype=np.float64)
    for r in range(rows):
        for c in range(cols):
            y0, y1 = r * BLOCK_SIZE, min((r + 1) * BLOCK_SIZE, height)
            x0, x1 = c * BLOCK_SIZE, min((c + 1) * BLOCK_SIZE, width)
            block_density[r, c] = magnitude[y0:y1, x0:x1].mean()
    return block_density


def edge_block_grid(image_bytes: bytes) -> np.ndarray:
    """Raw per-block edge-density grid, for the Learn-page precompute script."""
    return _block_grid(_gradient_magnitude(image_bytes))


def detect_edges(image_bytes: bytes) -> dict[str, Any]:
    try:
        magnitude = _gradient_magnitude(image_bytes)
        block_density = _block_grid(magnitude)

        mean_density = float(block_density.mean())
        std_density = float(block_density.std())
        max_density = float(block_density.max())

        normalized = cv2.normalize(magnitude, None, 0, 255, cv2.NORM_MINMAX)
        heatmap = cv2.applyColorMap(normalized.astype(np.uint8), cv2.COLORMAP_JET)

        success, encoded_png = cv2.imencode(".png", heatmap)
        if not success:
            raise ValueError("Could not encode edge-density heatmap")
        encoded = base64.b64encode(encoded_png.tobytes()).decode("ascii")

        return {
            "available": True,
            "image_base64": f"data:image/png;base64,{encoded}",
            "mean_edge_density": mean_density,
            "std_edge_density": std_density,
            "max_edge_density": max_density,
            "block_size": BLOCK_SIZE,
        }
    except Exception as exc:
        return {"available": False, "error": str(exc)}
