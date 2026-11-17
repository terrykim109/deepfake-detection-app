import os

import pytest

from forensics.edges import detect_edges, edge_block_grid

SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "Sample photos")


def _read(filename: str) -> bytes:
    with open(os.path.join(SAMPLES_DIR, filename), "rb") as f:
        return f.read()


@pytest.mark.parametrize("filename", ["sample_deepfake.jpg", "JPG Photo.jpg"])
def test_detect_edges_on_sample_images(filename):
    result = detect_edges(_read(filename))

    assert result["available"] is True
    assert result["image_base64"].startswith("data:image/png;base64,")
    assert isinstance(result["mean_edge_density"], float)
    assert result["block_size"] == 16


def test_detect_edges_on_corrupt_bytes():
    result = detect_edges(b"not an image")

    assert result["available"] is False
    assert "error" in result


def test_edge_block_grid_shape_matches_noise_block_grid():
    from forensics.noise import noise_block_grid

    data = _read("sample_deepfake.jpg")
    assert edge_block_grid(data).shape == noise_block_grid(data).shape
