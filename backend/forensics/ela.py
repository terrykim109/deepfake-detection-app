from __future__ import annotations

import base64
import io
from typing import Any

import numpy as np
from PIL import Image, ImageChops


def generate_ela(image_bytes: bytes, quality: int = 90) -> dict[str, Any]:
    try:
        with Image.open(io.BytesIO(image_bytes)) as original:
            original_rgb = original.convert("RGB")

        resaved_buffer = io.BytesIO()
        original_rgb.save(resaved_buffer, format="JPEG", quality=quality)
        resaved_buffer.seek(0)
        with Image.open(resaved_buffer) as resaved:
            diff = ImageChops.difference(original_rgb, resaved)

        diff_array = np.asarray(diff, dtype=np.float64)
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
