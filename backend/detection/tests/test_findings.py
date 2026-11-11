import hashlib
from pathlib import Path

import pytest

import detection.stub as stub
from detection.face_landmarks import detect_face
from detection.openrouter import _parse_findings
from detection.stub import StubDetector

SAMPLE_FAKE = Path(__file__).resolve().parents[2] / "ml" / "model_1" / "sample_image_deepfake.jpg"


def _finding(x, y, w, h, label="Cue", explanation="Looks inconsistent."):
    return {"label": label, "explanation": explanation, "x": x, "y": y, "w": w, "h": h}


def _box(finding):
    return (finding["x"], finding["y"], finding["w"], finding["h"])


def test_normalized_boxes_pass_through():
    result = _parse_findings([_finding(0.123456, 0.2, 0.3, 0.4)], verdict="fake")

    assert len(result) == 1
    assert result[0]["id"] == "f1"
    assert _box(result[0]) == (0.1235, 0.2, 0.3, 0.4)


def test_thousand_scale_boxes_are_rescaled():
    result = _parse_findings([_finding(250, 100, 500, 300)], verdict="fake")

    assert _box(result[0]) == (0.25, 0.1, 0.5, 0.3)


def test_one_large_value_rescales_whole_response():
    raw = [_finding(0.5, 0.5, 0.9, 0.9), _finding(200, 200, 100, 100)]

    result = _parse_findings(raw, verdict="warn")

    assert _box(result[0]) == (0.0005, 0.0005, 0.0009, 0.0009)
    assert _box(result[1]) == (0.2, 0.2, 0.1, 0.1)


def test_oversized_box_is_clipped_to_image():
    result = _parse_findings([_finding(0.8, 0.7, 0.5, 0.6)], verdict="fake")

    assert _box(result[0]) == (0.8, 0.7, 0.2, 0.3)


@pytest.mark.parametrize(
    "item",
    [
        _finding(0.1, 0.1, 0.0, 0.2),
        _finding(0.1, 0.1, 0.2, 0.0),
        _finding(1.0, 0.1, 0.2, 0.2),
        _finding(0.1, 1.0, 0.2, 0.2),
        _finding(1000, 100, 200, 200),
        _finding("left", 0.1, 0.2, 0.2),
        _finding(None, 0.1, 0.2, 0.2),
        {"label": "Cue", "explanation": "Looks inconsistent.", "x": 0.1, "y": 0.1, "w": 0.2},
        _finding(0.1, 0.1, 0.2, 0.2, label=""),
        _finding(0.1, 0.1, 0.2, 0.2, explanation="   "),
        "not a dict",
    ],
)
def test_degenerate_findings_are_dropped(item):
    assert _parse_findings([item], verdict="fake") == []


def test_real_verdict_and_non_list_return_empty():
    assert _parse_findings([_finding(0.1, 0.1, 0.2, 0.2)], verdict="real") == []
    assert _parse_findings({"x": 0.1}, verdict="fake") == []


def test_findings_are_capped_at_four():
    raw = [_finding(0.1 * i, 0.1, 0.05, 0.05) for i in range(6)]

    assert len(_parse_findings(raw, verdict="fake")) == 4


def test_optional_tip_and_region_confidence_pass_through():
    raw = [
        {**_finding(0.1, 0.1, 0.2, 0.2), "tip": "Compare both eyes.", "confidence": 77},
        {**_finding(0.4, 0.4, 0.2, 0.2), "confidence": 0.62},
        {**_finding(0.7, 0.7, 0.2, 0.2), "confidence": "high", "tip": "  "},
        {**_finding(0.1, 0.7, 0.2, 0.2), "confidence": 140},
    ]

    result = _parse_findings(raw, verdict="fake")

    assert result[0]["tip"] == "Compare both eyes."
    assert result[0]["confidence"] == 77
    assert result[1]["confidence"] == 62
    assert "confidence" not in result[2] and "tip" not in result[2]
    assert len(result) == 4


@pytest.fixture(autouse=True)
def no_demo_verdict(monkeypatch):
    # backend/.env may set STUB_DEMO_VERDICT for demos; tests start from the hash-based verdict
    monkeypatch.setattr(stub, "STUB_DEMO_VERDICT", "")


@pytest.fixture
def no_sleep(monkeypatch):
    monkeypatch.setattr(stub.time, "sleep", lambda _seconds: None)


def _image_with_verdict(wanted: set[str]) -> bytes:
    """Find bytes whose hash lands the stub on one of the wanted verdicts."""
    for i in range(1000):
        data = f"image-{i}".encode()
        score = int(hashlib.sha256(data).hexdigest()[:8], 16) % 101
        verdict = "fake" if score >= 70 else "warn" if score >= 40 else "real"
        if verdict in wanted:
            return data
    raise AssertionError(f"no sample hashed to {wanted}")


def _analyze(data: bytes):
    return StubDetector().analyze(image_bytes=data, filename="a.jpg", content_type="image/jpeg")


def _assert_valid_findings(findings, count):
    assert len(findings) == count
    confidences = [f["confidence"] for f in findings]
    assert confidences == sorted(confidences, reverse=True) or len(set(confidences)) < count
    for index, finding in enumerate(findings, start=1):
        assert finding["id"] == f"f{index}"
        assert finding["label"] and finding["explanation"] and finding["tip"]
        assert 30 <= finding["confidence"] <= 95
        x, y, w, h = _box(finding)
        assert 0 <= x and 0 <= y and w > 0 and h > 0
        assert x + w <= 1.0001 and y + h <= 1.0001


@pytest.mark.usefixtures("no_sleep")
def test_stub_without_face_uses_fallback_layout():
    # Synthetic bytes are not a decodable image, so no face is found
    data = _image_with_verdict({"fake"})

    first = _analyze(data)
    second = _analyze(data)

    assert first.findings == second.findings
    _assert_valid_findings(first.findings, 4)
    assert first.explanation_method == stub.METHOD_NO_FACE


@pytest.mark.usefixtures("no_sleep")
def test_stub_real_verdict_has_no_findings():
    result = _analyze(_image_with_verdict({"real"}))

    assert result.verdict == "real"
    assert result.findings == []
    assert result.explanation_method == ""


@pytest.mark.usefixtures("no_sleep")
def test_demo_verdict_forces_fake(monkeypatch):
    monkeypatch.setattr(stub, "STUB_DEMO_VERDICT", "fake")

    result = _analyze(_image_with_verdict({"real"}))

    assert result.verdict == "fake"
    assert 75 <= result.confidence <= 95
    _assert_valid_findings(result.findings, 4)


@pytest.mark.usefixtures("no_sleep")
def test_demo_verdict_warn_gives_three_findings(monkeypatch):
    monkeypatch.setattr(stub, "STUB_DEMO_VERDICT", "warn")

    result = _analyze(_image_with_verdict({"fake"}))

    assert result.verdict == "warn"
    _assert_valid_findings(result.findings, 3)


@pytest.mark.usefixtures("no_sleep")
def test_stub_places_regions_on_detected_face(monkeypatch):
    if not detect_face(SAMPLE_FAKE.read_bytes()):
        pytest.skip("YuNet model file not available")
    monkeypatch.setattr(stub, "STUB_DEMO_VERDICT", "fake")

    result = _analyze(SAMPLE_FAKE.read_bytes())

    assert result.explanation_method == stub.METHOD_FACE
    _assert_valid_findings(result.findings, 4)
    face = detect_face(SAMPLE_FAKE.read_bytes())
    fx, fy, fw, fh = face.box
    eye = next(f for f in result.findings if f["label"] == "Eye asymmetry")
    ex, ey = face.right_eye
    # The eye box contains the detected eye landmark
    assert eye["x"] <= ex / face.width <= eye["x"] + eye["w"]
    assert eye["y"] <= ey / face.height <= eye["y"] + eye["h"]


@pytest.mark.usefixtures("no_sleep")
def test_stub_findings_survive_the_parser(monkeypatch):
    monkeypatch.setattr(stub, "STUB_DEMO_VERDICT", "fake")
    findings = _analyze(SAMPLE_FAKE.read_bytes()).findings

    assert _parse_findings(findings, verdict="fake") == findings
