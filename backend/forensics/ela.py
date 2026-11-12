from __future__ import annotations

import base64
import io
from typing import Any

import numpy as np
from PIL import Image, ImageChops

BLOCK_SIZE = 16


def _diff_array(image_bytes: bytes, quality: int) -> np.ndarray:
    with Image.open(io.BytesIO(image_bytes)) as original:
        original_rgb = original.convert("RGB")

    resaved_buffer = io.BytesIO()
    original_rgb.save(resaved_buffer, format="JPEG", quality=quality)
    resaved_buffer.seek(0)
    with Image.open(resaved_buffer) as resaved:
        diff = ImageChops.difference(original_rgb, resaved)

    return np.asarray(diff, dtype=np.float64)


def _block_grid(diff_array: np.ndarray) -> np.ndarray:
    """Per-BLOCK_SIZE-block mean error, from the per-pixel RGB diff array."""
    intensity = diff_array.mean(axis=-1)
    height, width = intensity.shape
    rows = max(height // BLOCK_SIZE, 1)
    cols = max(width // BLOCK_SIZE, 1)

    block_mean = np.zeros((rows, cols), dtype=np.float64)
    for r in range(rows):
        for c in range(cols):
            y0, y1 = r * BLOCK_SIZE, min((r + 1) * BLOCK_SIZE, height)
            x0, x1 = c * BLOCK_SIZE, min((c + 1) * BLOCK_SIZE, width)
            block_mean[r, c] = intensity[y0:y1, x0:x1].mean()
    return block_mean


def ela_block_grid(image_bytes: bytes, quality: int = 90) -> np.ndarray:
    """Raw per-block ELA-error grid, for the Learn-page precompute script."""
    return _block_grid(_diff_array(image_bytes, quality))


def generate_ela(image_bytes: bytes, quality: int = 90) -> dict[str, Any]:
    try:
        diff_array = _diff_array(image_bytes, quality)
        max_error = float(diff_array.max()) if diff_array.size else 0.0
        mean_error = float(diff_array.mean()) if diff_array.size else 0.0

        scale = 255.0 / max_error if max_error > 0 else 1.0
        amplified = np.clip(diff_array * scale, 0, 255).astype(np.uint8)
        ela_image = Image.fromarray(amplified)

        output_buffer = io.BytesIO()
        ela_image.save(output_buffer, format="PNG")
        encoded = base64.b64encode(output_buffer.getvalue()).decode("ascii")

        return {
            "available": True,
            "image_base64": f"data:image/png;base64,{encoded}",
            "mean_error": mean_error,
            "max_error": max_error,
            "jpeg_quality": quality,
        }
    except Exception as exc:
        return {"available": False, "error": str(exc)}
