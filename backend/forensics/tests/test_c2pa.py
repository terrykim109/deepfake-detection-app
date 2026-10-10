import os

import pytest

from forensics.c2pa import check_c2pa

SAMPLES_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "ml", "model_1"
)


def _read(filename: str) -> bytes:
    with open(os.path.join(SAMPLES_DIR, filename), "rb") as f:
        return f.read()


@pytest.mark.parametrize(
    "filename", ["sample_image_real.jpg", "sample_image_deepfake.jpg"]
)
def test_check_c2pa_reports_not_found_on_plain_samples(filename):
    result = check_c2pa(_read(filename))

    assert result["found"] is False
    assert result["claim_generator"] is None
    assert "No content credentials" in result["detail"]


def test_check_c2pa_detects_injected_signature_and_claim_generator():
    fake_bytes = (
        b"\xff\xd8\xff\xeb\x00\x10jumb"
        b'...{"claim_generator":"Test Tool/1.0"}...'
    )

    result = check_c2pa(fake_bytes)

    assert result["found"] is True
    assert result["claim_generator"] == "Test Tool/1.0"


def test_check_c2pa_on_empty_bytes():
    result = check_c2pa(b"")

    assert result["found"] is False
