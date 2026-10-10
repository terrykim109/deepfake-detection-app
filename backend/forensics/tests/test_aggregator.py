import os
from unittest.mock import patch

from forensics import run_forensics

SAMPLES_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "ml", "model_1"
)


def _read(filename: str) -> bytes:
    with open(os.path.join(SAMPLES_DIR, filename), "rb") as f:
        return f.read()


def test_run_forensics_returns_all_sections_on_valid_image():
    result = run_forensics(_read("sample_image_real.jpg"), "sample_image_real.jpg")

    assert set(result.keys()) == {"metadata", "ela", "noise", "c2pa"}
    assert result["metadata"]["available"] is True
    assert result["ela"]["available"] is True
    assert result["noise"]["available"] is True
    assert result["c2pa"]["found"] is False


def test_run_forensics_keeps_all_keys_when_one_analysis_raises():
    with patch("forensics.generate_ela", side_effect=RuntimeError("boom")):
        result = run_forensics(_read("sample_image_real.jpg"), "sample_image_real.jpg")

    assert set(result.keys()) == {"metadata", "ela", "noise", "c2pa"}
    assert result["ela"] == {"available": False, "error": "boom"}
    assert result["metadata"]["available"] is True
    assert result["noise"]["available"] is True


def test_run_forensics_on_corrupt_bytes_still_returns_all_keys():
    result = run_forensics(b"not an image", "bad.jpg")

    assert set(result.keys()) == {"metadata", "ela", "noise", "c2pa"}
    for section in ("metadata", "ela", "noise"):
        assert result[section]["available"] is False
