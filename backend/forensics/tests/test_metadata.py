import io
import os

import pytest
from PIL import Image

from forensics.metadata import extract_metadata

SAMPLES_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "ml", "model_1"
)


def _read(filename: str) -> bytes:
    with open(os.path.join(SAMPLES_DIR, filename), "rb") as f:
        return f.read()


@pytest.mark.parametrize(
    "filename", ["sample_image_real.jpg", "sample_image_deepfake.jpg"]
)
def test_extract_metadata_on_sample_images(filename):
    result = extract_metadata(_read(filename))

    assert result["available"] is True
    assert result["file_info"]["width"] > 0
    assert result["file_info"]["height"] > 0
    assert isinstance(result["exif"], dict)


def test_extract_metadata_on_image_with_no_exif():
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), color="red").save(buffer, format="PNG")

    result = extract_metadata(buffer.getvalue())

    assert result["available"] is True
    assert result["exif"] == {}
    assert result["has_gps"] is False


def test_extract_metadata_on_corrupt_bytes():
    result = extract_metadata(b"not an image")

    assert result["available"] is False
    assert "error" in result
