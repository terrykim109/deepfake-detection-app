# test/test_model_output.py
# QA — model output and invalid-result handling: successful outputs plus
# malformed, null, unsupported, and inconclusive outputs must be handled
# safely by the backend (and never reach the UI in an unrenderable shape).

import math

import pytest
from pydantic import ValidationError

import routers.analysis
from detection import DetectionError, DetectionResult, validate_detection_output
from detection.base import DEFAULT_SUMMARIES, DEFAULT_VERDICT_LABELS, UNUSABLE_RESULT_MESSAGE
from detection.stub import StubDetector
from schemas import AnalysisResult

FRONTEND_VERDICTS = {"real", "warn", "fake"}  # frontend/src/detection/detector.ts Verdict


def ok_output(**overrides) -> dict:
    out = {
        "verdict": "fake",
        "verdict_label": "Likely manipulated",
        "confidence": 87,
        "summary": "Blending artifacts around the jawline.",
        "provider": "test-model",
    }
    out.update(overrides)
    return out


class FakeDetector:
    """Detector that returns (or raises) whatever the test hands it."""

    name = "fake-detector"

    def __init__(self, output=None, error: Exception | None = None):
        self.output, self.error = output, error

    def analyze(self, *, image_bytes, filename, content_type):
        if self.error:
            raise self.error
        return self.output


@pytest.fixture
def use_detector(monkeypatch):
    def _use(detector):
        monkeypatch.setattr(routers.analysis, "get_detector", lambda: detector)
        return detector

    return _use


# ---------------------------------------------------------------------------
# validate_detection_output — successful outputs
# ---------------------------------------------------------------------------

class TestSuccessfulOutputs:
    @pytest.mark.parametrize("verdict", ["real", "warn", "fake"])
    def test_each_supported_verdict_passes(self, verdict):
        result = validate_detection_output(ok_output(verdict=verdict), provider="x")
        assert result.verdict == verdict
        assert result.confidence == 87
        assert result.provider == "test-model"

    def test_dataclass_output_passes_through(self):
        raw = DetectionResult("real", "No manipulation detected", 72, "Looks clean.", "stub")
        assert validate_detection_output(raw, provider="stub") == raw

    @pytest.mark.parametrize("confidence, expected", [(0, 0), (100, 100), (87.4, 87), (87.6, 88)])
    def test_confidence_bounds_and_rounding(self, confidence, expected):
        assert validate_detection_output(ok_output(confidence=confidence), provider="x").confidence == expected

    @pytest.mark.parametrize("raw, expected", [("FAKE", "fake"), ("  Real ", "real"), ("authentic", "real"), ("manipulated", "fake")])
    def test_verdict_spelling_is_normalised(self, raw, expected):
        assert validate_detection_output(ok_output(verdict=raw), provider="x").verdict == expected

    def test_missing_label_and_summary_get_plain_language_defaults(self):
        raw = {"verdict": "fake", "confidence": 90}
        result = validate_detection_output(raw, provider="test-model")
        assert result.verdict_label == DEFAULT_VERDICT_LABELS["fake"]
        assert result.summary == DEFAULT_SUMMARIES["fake"]
        assert result.provider == "test-model"  # falls back to detector name

    def test_stub_detector_output_satisfies_contract(self):
        for payload in (b"a", b"b", b"c", b"d", b"e", b"f"):
            raw = StubDetector().analyze(image_bytes=payload, filename="x.jpg", content_type="image/jpeg")
            result = validate_detection_output(raw, provider="stub")
            assert result.verdict in FRONTEND_VERDICTS
            assert 0 <= result.confidence <= 100


# ---------------------------------------------------------------------------
# validate_detection_output — inconclusive outputs
# ---------------------------------------------------------------------------

class TestInconclusiveOutputs:
    @pytest.mark.parametrize("raw", ["warn", "inconclusive", "Inconclusive", "uncertain"])
    def test_inconclusive_maps_to_warn(self, raw):
        result = validate_detection_output({"verdict": raw, "confidence": 50}, provider="x")
        assert result.verdict == "warn"
        assert result.verdict_label == DEFAULT_VERDICT_LABELS["warn"]
        assert "inconclusive" in result.summary.lower()

    def test_inconclusive_with_low_confidence_is_still_a_result(self):
        result = validate_detection_output({"verdict": "inconclusive", "confidence": 0}, provider="x")
        assert (result.verdict, result.confidence) == ("warn", 0)


# ---------------------------------------------------------------------------
# validate_detection_output — null / malformed / unsupported outputs
# ---------------------------------------------------------------------------

class TestRejectedOutputs:
    @pytest.mark.parametrize("raw", [None, "fake", 0.87, ["fake", 87], object()])
    def test_null_or_non_object_output_is_rejected(self, raw):
        with pytest.raises(DetectionError) as exc:
            validate_detection_output(raw, provider="x")
        assert exc.value.message == UNUSABLE_RESULT_MESSAGE

    @pytest.mark.parametrize("verdict", [None, "", "   ", 1, "unknown", "deepfake", "error"])
    def test_missing_or_unsupported_verdict_is_rejected(self, verdict):
        with pytest.raises(DetectionError):
            validate_detection_output(ok_output(verdict=verdict), provider="x")

    @pytest.mark.parametrize(
        "confidence",
        [None, "87", True, False, -1, 100.01, 870, math.nan, math.inf, -math.inf],
    )
    def test_invalid_confidence_is_rejected(self, confidence):
        with pytest.raises(DetectionError):
            validate_detection_output(ok_output(confidence=confidence), provider="x")

    def test_missing_confidence_is_rejected(self):
        raw = ok_output()
        del raw["confidence"]
        with pytest.raises(DetectionError):
            validate_detection_output(raw, provider="x")

    def test_internal_reason_kept_separate_from_user_message(self):
        with pytest.raises(DetectionError) as exc:
            validate_detection_output(ok_output(verdict="unknown"), provider="x")
        assert "unknown" in exc.value.reason
        assert "unknown" not in exc.value.message


# ---------------------------------------------------------------------------
# AnalysisResult schema contract
# ---------------------------------------------------------------------------

class TestAnalysisResultSchema:
    def base(self, **overrides):
        data = {
            "id": "R1", "verdict": "fake", "verdict_label": "Likely manipulated",
            "confidence": 87, "summary": "x", "file_name": "a.jpg",
            "created_at": "2026-10-14T00:00:00+00:00", "provider": "stub",
        }
        data.update(overrides)
        return data

    def test_valid_result(self):
        assert AnalysisResult(**self.base()).verdict == "fake"

    @pytest.mark.parametrize(
        "overrides",
        [{"verdict": "unknown"}, {"confidence": 101}, {"confidence": -1}, {"summary": ""}, {"verdict_label": ""}, {"extra": 1}],
    )
    def test_off_contract_result_is_rejected(self, overrides):
        with pytest.raises(ValidationError):
            AnalysisResult(**self.base(**overrides))

    def test_schema_verdicts_match_frontend(self):
        schema = AnalysisResult.model_json_schema()
        assert set(schema["properties"]["verdict"]["enum"]) == FRONTEND_VERDICTS


# ---------------------------------------------------------------------------
# API: /analysis/run with each kind of model output
# ---------------------------------------------------------------------------

def run(client, headers, jpeg_file):
    return client.post("/api/analysis/run", headers=headers, files=jpeg_file)


def assert_safe_failure(res, client, headers, db):
    """Failed analysis: 503, plain-language message, image deleted, slot freed."""
    assert res.status_code == 503
    detail = res.json()["detail"]
    assert "deleted" in detail
    assert "Traceback" not in detail

    usage = client.get("/api/analysis/usage", headers=headers).json()
    assert usage["active"] is False  # user can upload again

    events = [e["event_type"] for e in db.docs("audit_logs").values()]
    assert "analysis_failed" in events
    return detail


class TestRunEndpointOutputs:
    def test_successful_output_is_returned_in_contract_shape(self, client, auth_headers, jpeg_file, use_detector):
        use_detector(FakeDetector(ok_output()))
        res = run(client, auth_headers, jpeg_file)

        assert res.status_code == 200
        result = res.json()["result"]
        AnalysisResult(**result)  # exact contract, no extra fields
        assert result["verdict"] == "fake"
        assert result["confidence"] == 87
        assert result["summary"] == "Blending artifacts around the jawline."

    def test_inconclusive_output_returns_warn_result(self, client, auth_headers, jpeg_file, use_detector):
        use_detector(FakeDetector({"verdict": "inconclusive", "confidence": 48}))
        res = run(client, auth_headers, jpeg_file)

        assert res.status_code == 200
        result = res.json()["result"]
        assert result["verdict"] == "warn"
        assert result["verdict_label"] == DEFAULT_VERDICT_LABELS["warn"]
        assert result["provider"] == "fake-detector"

    @pytest.mark.parametrize(
        "output",
        [
            None,
            {},
            "fake",
            {"verdict": "unknown", "confidence": 50},
            {"verdict": "fake"},
            {"verdict": "fake", "confidence": "high"},
            {"verdict": "fake", "confidence": math.nan},
            {"verdict": "fake", "confidence": 0.87e3},
        ],
        ids=["null", "empty", "bare-string", "unsupported-verdict", "no-confidence",
             "string-confidence", "nan-confidence", "out-of-range"],
    )
    def test_bad_output_fails_safely(self, client, db, auth_headers, jpeg_file, use_detector, output):
        use_detector(FakeDetector(output))
        detail = assert_safe_failure(run(client, auth_headers, jpeg_file), client, auth_headers, db)
        assert detail.startswith(UNUSABLE_RESULT_MESSAGE)

    def test_detector_error_fails_safely(self, client, db, auth_headers, jpeg_file, use_detector):
        use_detector(FakeDetector(error=DetectionError("The model is offline.")))
        detail = assert_safe_failure(run(client, auth_headers, jpeg_file), client, auth_headers, db)
        assert detail.startswith("The model is offline.")

    def test_detector_crash_fails_safely_without_leaking_internals(self, client, db, auth_headers, jpeg_file, use_detector):
        use_detector(FakeDetector(error=RuntimeError("CUDA out of memory at /opt/model.py:42")))
        detail = assert_safe_failure(run(client, auth_headers, jpeg_file), client, auth_headers, db)
        assert "CUDA" not in detail

    def test_temp_image_deleted_after_bad_output(self, client, auth_headers, jpeg_file, use_detector):
        import temp_images
        from pathlib import Path

        use_detector(FakeDetector(None))
        run(client, auth_headers, jpeg_file)
        leftovers = [p for p in Path(temp_images.TEMP_UPLOAD_DIR).glob("IMG*") if p.suffix != ".json"]
        assert leftovers == []
