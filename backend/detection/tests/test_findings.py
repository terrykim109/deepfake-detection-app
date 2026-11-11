import json
from pathlib import Path

import cv2
import numpy as np
import pytest

import detection.face_landmarks as face_landmarks
from detection.face_landmarks import detect_face
from detection.openrouter import _MAX_FINDINGS, _extract_json, _parse_findings

SAMPLE_FACE = Path(__file__).resolve().parents[2] / "Sample photos" / "sample_deepfake.jpg"


def _finding(x, y, w, h, label="Cue", explanation="Looks inconsistent."):
    return {"label": label, "explanation": explanation, "x": x, "y": y, "w": w, "h": h}


def _box(finding):
    return (finding["x"], finding["y"], finding["w"], finding["h"])


# --- Region parsing (openrouter._parse_findings) ---


def test_normalized_boxes_pass_through():
    result = _parse_findings([_finding(0.123456, 0.2, 0.3, 0.4)], verdict="fake")

    assert len(result) == 1
    assert result[0]["id"] == "f1"
    assert _box(result[0]) == (0.1235, 0.2, 0.3, 0.4)


def test_percent_boxes_are_rescaled():
    result = _parse_findings([_finding(25, 10, 50, 30)], verdict="fake")

    assert _box(result[0]) == (0.25, 0.1, 0.5, 0.3)


def test_thousand_scale_boxes_are_rescaled():
    result = _parse_findings([_finding(250, 100, 500, 300)], verdict="fake")

    assert _box(result[0]) == (0.25, 0.1, 0.5, 0.3)


def test_one_scale_is_used_for_the_whole_response():
    # 0.5 must not stay 0.5 when the same model answers 40 for another box
    raw = [_finding(0.5, 0.5, 20, 20), _finding(40, 40, 10, 10)]

    result = _parse_findings(raw, verdict="warn")

    assert _box(result[0]) == (0.005, 0.005, 0.2, 0.2)
    assert _box(result[1]) == (0.4, 0.4, 0.1, 0.1)


def test_oversized_box_is_clipped_to_image():
    result = _parse_findings([_finding(0.8, 0.7, 0.5, 0.6)], verdict="fake")

    assert _box(result[0]) == (0.8, 0.7, 0.2, 0.3)


@pytest.mark.parametrize(
    "item",
    [
        _finding(0.1, 0.1, 0.0, 0.2),
        _finding(0.1, 0.1, 0.2, 0.0),
        _finding(0.1, 0.1, 0.005, 0.2),
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


def test_findings_are_capped():
    raw = [_finding(0.1 * i, 0.1, 0.05, 0.05) for i in range(6)]

    assert len(_parse_findings(raw, verdict="fake")) == _MAX_FINDINGS


def test_optional_tip_and_region_confidence_pass_through():
    raw = [
        {**_finding(0.1, 0.1, 0.2, 0.2), "tip": "Compare both eyes.", "confidence": 77},
        {**_finding(0.4, 0.4, 0.2, 0.2), "confidence": 0.62},
        {**_finding(0.7, 0.7, 0.2, 0.2), "confidence": "high", "tip": "  "},
    ]

    result = _parse_findings(raw, verdict="fake")

    assert result[0]["tip"] == "Compare both eyes."
    assert result[0]["confidence"] == 77
    assert result[1]["confidence"] == 62
    assert "confidence" not in result[2] and "tip" not in result[2]


def test_out_of_range_region_confidence_is_dropped():
    raw = [{**_finding(0.1, 0.1, 0.2, 0.2), "confidence": 140}]

    assert "confidence" not in _parse_findings(raw, verdict="fake")[0]


# --- Truncated model replies (openrouter._extract_json) ---


def test_truncated_reply_keeps_complete_findings_with_teachable_fields():
    complete = {**_finding(0.1, 0.2, 0.3, 0.4), "tip": 'Check the "catchlights".', "confidence": 70}
    text = (
        '{"verdict":"fake","confidence":82,"summary":"Looks generated.","findings":['
        + json.dumps(complete)
        + ',{"label":"Hair","explanation":"Strands mel'
    )

    data = _extract_json(text)
    findings = _parse_findings(data["findings"], verdict="fake")

    assert data["verdict"] == "fake"
    assert len(findings) == 1
    assert findings[0]["tip"] == 'Check the "catchlights".'
    assert findings[0]["confidence"] == 70
    assert _box(findings[0]) == (0.1, 0.2, 0.3, 0.4)


def test_truncated_reply_without_teachable_fields_still_recovers():
    text = (
        '{"verdict":"warn","confidence":55,"summary":"Unclear.","findings":['
        + json.dumps(_finding(0.1, 0.2, 0.3, 0.4))
        + ',{"label":"Cut'
    )

    findings = _parse_findings(_extract_json(text)["findings"], verdict="warn")

    assert len(findings) == 1
    assert "tip" not in findings[0]


# --- Face landmarks (used by the general-explanation fallback) ---


def test_detect_face_returns_none_for_undecodable_bytes():
    assert detect_face(b"not an image") is None


def test_detect_face_returns_none_for_blank_image():
    ok, encoded = cv2.imencode(".png", np.full((200, 200, 3), 255, dtype=np.uint8))
    assert ok

    assert detect_face(encoded.tobytes()) is None


def test_detect_face_returns_none_without_model_file(monkeypatch, tmp_path):
    monkeypatch.setattr(face_landmarks, "_MODEL_PATH", tmp_path / "missing.onnx")

    assert detect_face(b"anything") is None


def test_detect_face_finds_landmarks_on_sample_photo():
    if not SAMPLE_FACE.is_file():
        pytest.skip("sample photo not available")

    face = detect_face(SAMPLE_FACE.read_bytes())

    assert face is not None
    fx, fy, fw, fh = face.box
    assert fw > 0 and fh > 0
    for px, py in (face.right_eye, face.left_eye, face.nose, face.mouth_right, face.mouth_left):
        assert 0 <= px <= face.width and 0 <= py <= face.height
    # Subject's right eye is on the image left, and eyes sit above the mouth
    assert face.right_eye[0] < face.left_eye[0]
    assert face.right_eye[1] < face.mouth_right[1]
