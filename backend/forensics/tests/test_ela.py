import io
import os

import pytest
from PIL import Image

from forensics.ela import generate_ela

SAMPLES_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "ml", "model_1"
)


def _read(filename: str) -> bytes:
    with open(os.path.join(SAMPLES_DIR, filename), "rb") as f:
        return f.read()


@pytest.mark.parametrize(
    "filename", ["sample_image_real.jpg", "sample_image_deepfake.jpg"]
)
def test_generate_ela_on_jpeg_samples(filename):
    result = generate_ela(_read(filename))

    assert result["available"] is True
    assert result["image_base64"].startswith("data:image/png;base64,")
    assert isinstance(result["mean_error"], float)
    assert isinstance(result["max_error"], float)


def test_generate_ela_on_png_input_converts_to_rgb():
    buffer = io.BytesIO()
    Image.new("RGBA", (32, 32), color=(255, 0, 0, 128)).save(buffer, format="PNG")

    result = generate_ela(buffer.getvalue())

    assert result["available"] is True
    assert result["image_base64"].startswith("data:image/png;base64,")


def test_generate_ela_on_corrupt_bytes():
    result = generate_ela(b"not an image")

    assert result["available"] is False
    assert "error" in result
