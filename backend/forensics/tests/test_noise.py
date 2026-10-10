import os

import pytest

from forensics.noise import analyze_noise

SAMPLES_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "ml", "model_1"
)


def _read(filename: str) -> bytes:
    with open(os.path.join(SAMPLES_DIR, filename), "rb") as f:
        return f.read()


@pytest.mark.parametrize(
    "filename", ["sample_image_real.jpg", "sample_image_deepfake.jpg"]
)
def test_analyze_noise_on_sample_images(filename):
    result = analyze_noise(_read(filename))

    assert result["available"] is True
    assert result["image_base64"].startswith("data:image/png;base64,")
    assert isinstance(result["mean_block_variance"], float)
    assert isinstance(result["outlier_block_count"], int)


def test_analyze_noise_on_corrupt_bytes():
    result = analyze_noise(b"not an image")

    assert result["available"] is False
    assert "error" in result
