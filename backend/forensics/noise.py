from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np

BLOCK_SIZE = 16
OUTLIER_THRESHOLD_STD = 2.0


def analyze_noise(image_bytes: bytes) -> dict[str, Any]:
    try:
        buffer = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Could not decode image bytes")

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        high_pass = cv2.Laplacian(gray, cv2.CV_64F)

        height, width = high_pass.shape
        rows = max(height // BLOCK_SIZE, 1)
        cols = max(width // BLOCK_SIZE, 1)

        block_variance = np.zeros((rows, cols), dtype=np.float64)
        for r in range(rows):
            for c in range(cols):
                y0, y1 = r * BLOCK_SIZE, min((r + 1) * BLOCK_SIZE, height)
                x0, x1 = c * BLOCK_SIZE, min((c + 1) * BLOCK_SIZE, width)
                block_variance[r, c] = high_pass[y0:y1, x0:x1].var()

        mean_variance = float(block_variance.mean())
        std_variance = float(block_variance.std())
        outlier_count = int(
            np.sum(np.abs(block_variance - mean_variance) > OUTLIER_THRESHOLD_STD * std_variance)
        ) if std_variance > 0 else 0

        normalized = cv2.normalize(block_variance, None, 0, 255, cv2.NORM_MINMAX)
        heatmap_small = cv2.applyColorMap(normalized.astype(np.uint8), cv2.COLORMAP_JET)
        heatmap = cv2.resize(heatmap_small, (width, height), interpolation=cv2.INTER_NEAREST)

        success, encoded_png = cv2.imencode(".png", heatmap)
        if not success:
            raise ValueError("Could not encode noise heatmap")
        encoded = base64.b64encode(encoded_png.tobytes()).decode("ascii")

        return {
            "available": True,
            "image_base64": f"data:image/png;base64,{encoded}",
            "mean_block_variance": mean_variance,
            "std_block_variance": std_variance,
            "outlier_block_count": outlier_count,
            "block_size": BLOCK_SIZE,
        }
    except Exception as exc:
        return {"available": False, "error": str(exc)}
