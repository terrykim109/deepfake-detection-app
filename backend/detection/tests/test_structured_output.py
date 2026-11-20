"""Structured-output schema + OpenRouter parser tests."""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python test_structured_output.py` from this folder, and pytest from backend/.
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

import json

import pytest
from pydantic import ValidationError

from detection.openrouter import _extract_json, _parse_model_payload
from schemas import FindingOutput, ModelAnalysisOutput


VALID_OUTPUT = {
    "verdict": "warn",
    "confidence": 75,
    "summary": "Some image characteristics require further review.",
    "findings": [
        {
            "label": "Eyes",
            "explanation": "Reflections appear inconsistent.",
            "x": 0.2,
            "y": 0.3,
            "w": 0.25,
            "h": 0.15,
        }
    ],
}


def make_payload(data):
    return {
        "model": "served-model",
        "choices": [
            {
                "message": {
                    "content": json.dumps(data),
                }
            }
        ],
    }


# ── Schema (soft validation) ───────────────────────────────────────────────


def test_complete_schema_validation():
    result = ModelAnalysisOutput.model_validate(VALID_OUTPUT)

    assert result.verdict == "warn"
    assert result.confidence == 75
    assert result.summary
    assert isinstance(result.findings, list)
    assert len(result.findings) == 1


def test_schema_accepts_explicit_null_values():
    nullable_output = {
        "verdict": None,
        "confidence": None,
        "summary": None,
        "findings": [
            {
                "label": None,
                "explanation": None,
                "x": None,
                "y": None,
                "w": None,
                "h": None,
            }
        ],
    }

    result = ModelAnalysisOutput.model_validate(nullable_output)

    assert result.verdict is None
    assert result.confidence is None
    assert result.summary is None
    assert result.findings is not None
    assert result.findings[0]["label"] is None


def test_schema_ignores_unexpected_fields():
    result = ModelAnalysisOutput.model_validate(
        {**VALID_OUTPUT, "unexpected_field": "unexpected value"}
    )
    assert result.verdict == "warn"
    assert not hasattr(result, "unexpected_field") or "unexpected_field" not in result.model_dump()


def test_schema_ignores_nested_finding_extra_fields():
    finding = FindingOutput.model_validate(
        {**VALID_OUTPUT["findings"][0], "extra": "nope"}
    )
    assert finding.label == "Eyes"
    assert "extra" not in finding.model_dump()


# ── Parser integration (original behaviour) ────────────────────────────────


def test_parser_accepts_complete_valid_response():
    score = _parse_model_payload("test-model", make_payload(VALID_OUTPUT))

    assert score.model == "served-model"
    assert score.verdict == "warn"
    assert score.confidence == 75
    assert score.summary
    assert len(score.findings) == 1
    assert score.findings[0]["label"] == "Eyes"


def test_parser_accepts_nullable_summary_and_findings():
    score = _parse_model_payload(
        "test-model",
        make_payload({**VALID_OUTPUT, "summary": None, "findings": None}),
    )

    assert score.summary  # fallback summary
    assert score.findings == []


def test_parser_accepts_missing_optional_fields():
    """Original parser only required recoverable verdict + confidence."""
    score = _parse_model_payload(
        "test-model",
        make_payload({"verdict": "real", "confidence": 12}),
    )

    assert score.verdict == "real"
    assert score.confidence == 12
    assert score.summary  # fallback
    assert score.findings == []


def test_parser_ignores_unexpected_fields():
    score = _parse_model_payload(
        "test-model",
        make_payload({**VALID_OUTPUT, "unexpected_field": "unexpected value"}),
    )

    assert score.verdict == "warn"
    assert score.confidence == 75


def test_parser_clamps_confidence_outside_0_100():
    """Original behaviour: clamp, do not reject."""
    high = _parse_model_payload(
        "test-model",
        make_payload({**VALID_OUTPUT, "confidence": 105}),
    )
    low = _parse_model_payload(
        "test-model",
        make_payload({**VALID_OUTPUT, "confidence": -3}),
    )

    assert high.confidence == 100
    assert low.confidence == 0


def test_parser_filters_malformed_findings_instead_of_rejecting():
    """Original behaviour: skip bad finding rows; keep the overall score."""
    score = _parse_model_payload(
        "test-model",
        make_payload(
            {
                **VALID_OUTPUT,
                "findings": [
                    {
                        **VALID_OUTPUT["findings"][0],
                        "x": "not-a-coordinate",
                    },
                    {
                        "label": "Mouth",
                        "explanation": "Teeth look inconsistent.",
                        "x": 0.4,
                        "y": 0.5,
                        "w": 0.2,
                        "h": 0.1,
                    },
                ],
            }
        ),
    )

    assert score.verdict == "warn"
    assert len(score.findings) == 1
    assert score.findings[0]["label"] == "Mouth"


def test_parser_treats_non_list_findings_as_empty():
    score = _parse_model_payload(
        "test-model",
        make_payload({**VALID_OUTPUT, "findings": "not-a-list"}),
    )

    assert score.findings == []


def test_parser_rejects_invalid_verdict_values():
    with pytest.raises(ValueError, match="invalid verdict"):
        _parse_model_payload(
            "test-model",
            make_payload({**VALID_OUTPUT, "verdict": 123}),
        )


def test_parser_rejects_null_verdict_like_original():
    # Original: str(None) -> "none" -> invalid verdict
    with pytest.raises(ValueError, match=r"invalid verdict: 'none'"):
        _parse_model_payload(
            "test-model",
            make_payload({**VALID_OUTPUT, "verdict": None}),
        )


def test_parser_missing_verdict_key_stays_empty_string_not_none():
    """Pydantic must not inject verdict=None for unset keys (would become 'none')."""
    with pytest.raises(ValueError, match=r"invalid verdict: ''"):
        _parse_model_payload(
            "test-model",
            make_payload({"confidence": 40, "summary": "x", "findings": []}),
        )


def test_parser_rejects_invalid_confidence_types():
    with pytest.raises(ValueError, match="invalid confidence"):
        _parse_model_payload(
            "test-model",
            make_payload({**VALID_OUTPUT, "confidence": "not-a-number"}),
        )


def test_parser_rejects_null_confidence_like_original():
    with pytest.raises(ValueError, match="invalid confidence"):
        _parse_model_payload(
            "test-model",
            make_payload({**VALID_OUTPUT, "confidence": None}),
        )


# ── Regression: original recovery / normalization paths ────────────────────


def test_regression_truncated_json_recovery_still_parses():
    payload = (
        '{"verdict": "warn", "confidence": 70, '
        '"summary": "The image shows soft, uniform textures and dreamy lighting '
        "consistent with AI-generated art"
    )
    recovered = _extract_json(payload)
    score = _parse_model_payload(
        "test-model",
        {
            "model": "served-model",
            "choices": [{"message": {"content": payload}}],
        },
    )

    assert recovered["verdict"] == "warn"
    assert score.verdict == "warn"
    assert score.confidence == 70
    assert "AI-generated" in score.summary


def test_regression_verdict_normalization_is_case_insensitive():
    score = _parse_model_payload(
        "test-model",
        make_payload({**VALID_OUTPUT, "verdict": "  FaKe "}),
    )
    assert score.verdict == "fake"


def test_regression_percent_finding_coordinates_still_normalized():
    score = _parse_model_payload(
        "test-model",
        make_payload(
            {
                **VALID_OUTPUT,
                "findings": [
                    {
                        "label": "Eyes",
                        "explanation": "Reflections look inconsistent.",
                        "x": 20,
                        "y": 30,
                        "w": 25,
                        "h": 15,
                    }
                ],
            }
        ),
    )

    assert score.findings[0]["x"] == 0.2
    assert score.findings[0]["y"] == 0.3
    assert score.findings[0]["w"] == 0.25
    assert score.findings[0]["h"] == 0.15


def test_regression_real_verdict_clears_findings():
    score = _parse_model_payload(
        "test-model",
        make_payload({**VALID_OUTPUT, "verdict": "real", "confidence": 10}),
    )
    assert score.findings == []

if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))