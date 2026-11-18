import httpx
import pytest

from detection.openrouter import (
    _extract_json,
    _http_error_detail,
    _parse_findings,
    _parse_model_payload,
)
from detection.base import DetectionError


def test_http_error_detail_extracts_provider_message():
    response = httpx.Response(
        429,
        json={"error": {"message": "Rate limit exceeded"}},
    )
    assert _http_error_detail(response) == "Rate limit exceeded"


def test_detection_error_keeps_public_message_separate_from_diagnostic():
    diagnostic = "google/model: HTTP 429: Rate limit exceeded"
    public_message = (
        "We couldn't analyze this image right now. "
        "Please try again in a moment."
    )
    error = DetectionError(
        diagnostic,
        diagnostic=diagnostic,
        user_message=public_message,
    )

    assert error.user_message == public_message
    assert error.diagnostic == diagnostic


def test_extract_json_recovers_truncated_model_payload():
    payload = (
        '{"verdict": "warn", "confidence": 70, '
        '"summary": "The image shows soft, uniform textures and dreamy lighting '
        "consistent with AI-generated art"
    )

    assert _extract_json(payload) == {
        "verdict": "warn",
        "confidence": "70",
        "summary": "The image shows soft, uniform textures and dreamy lighting "
        "consistent with AI-generated art",
        "findings": [],
    }


def test_extract_json_recovers_complete_findings_from_truncated_payload():
    payload = (
        '{"verdict":"fake","confidence":88,"summary":"Looks edited.",'
        '"findings":[{"label":"Jaw line","explanation":"Edges look warped.",'
        '"x":0.1,"y":0.2,"w":0.3,"h":0.25},{"label":"Incomplete'
    )
    data = _extract_json(payload)
    assert data["verdict"] == "fake"
    assert len(data["findings"]) == 1
    assert data["findings"][0]["label"] == "Jaw line"


def test_parse_findings_accepts_percent_coordinates():
    findings = _parse_findings(
        [
            {
                "label": "Eyes",
                "explanation": "Reflections look inconsistent.",
                "x": 20,
                "y": 30,
                "w": 25,
                "h": 15,
            }
        ],
        verdict="warn",
    )
    assert len(findings) == 1
    assert findings[0]["x"] == 0.2
    assert findings[0]["y"] == 0.3
    assert findings[0]["w"] == 0.25
    assert findings[0]["h"] == 0.15


def test_parse_model_payload_accepts_text_content_parts():
    score = _parse_model_payload(
        "test-model",
        {
            "model": "served-model",
            "choices": [
                {
                    "message": {
                        "content": [
                            {"type": "output_text", "text": '{"verdict":"real",'},
                            {"type": "output_text", "text": '"confidence":12,'},
                            {"type": "output_text", "text": '"summary":"Looks authentic."}'},
                        ]
                    }
                }
            ],
        },
    )

    assert score.model == "served-model"
    assert score.verdict == "real"
    assert score.confidence == 12
    assert score.summary == "Looks authentic."


def test_extract_json_still_rejects_missing_required_fields():
    with pytest.raises(ValueError):
        _extract_json('{"verdict":"warn","confidence":70,')
