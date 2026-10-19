# test/test_upload_workflow.py
# QA — main path: authenticated upload → validation → analysis → result,
# including temp-image deletion, quotas, and the stepwise start/finish path.

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

import temp_images
from config import MAX_ANALYSES_PER_24H, MAX_UPLOAD_BYTES
from conftest import JPEG_BYTES, PNG_BYTES, WEBP_BYTES
from schemas import AnalysisRunResponse


def temp_image_files() -> list[Path]:
    root = Path(temp_images.TEMP_UPLOAD_DIR)
    return [p for p in root.glob("IMG*") if p.suffix != ".json"] if root.exists() else []


def usage(client, headers) -> dict:
    return client.get("/api/analysis/usage", headers=headers).json()


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

class TestHappyPath:
    def test_upload_analyze_and_return_result(self, client, db, auth_headers, jpeg_file):
        res = client.post("/api/analysis/run", headers=auth_headers, files=jpeg_file)
        assert res.status_code == 200
        body = res.json()

        # Whole response matches the documented contract
        AnalysisRunResponse(**body)
        assert body["status"] == "completed"

        result = body["result"]
        assert result["id"].startswith("R")
        assert result["verdict"] in {"real", "warn", "fake"}
        assert 0 <= result["confidence"] <= 100
        assert result["summary"]
        assert result["file_name"] == "photo.jpg"
        assert result["provider"] == "stub"

        # Original image is gone once the result is returned
        assert body["privacy"]["image_deleted"] is True
        assert body["image"]["delete_reason"] == "analysis_success"
        assert body["privacy"]["lifetime_seconds"] < 60
        assert temp_image_files() == []

        # Quota updated, slot released
        assert body["usage"]["count_24h"] == 1
        assert body["usage"]["active"] is False

        events = [e["event_type"] for e in db.docs("audit_logs").values()]
        assert "analysis_success" in events

    @pytest.mark.parametrize(
        "name, data, mime",
        [("a.png", PNG_BYTES, "image/png"), ("a.webp", WEBP_BYTES, "image/webp"),
         ("a.jpeg", JPEG_BYTES, "image/jpeg"), ("a.jpg", JPEG_BYTES, "application/octet-stream")],
        ids=["png", "webp", "jpeg", "jpg-octet-stream"],
    )
    def test_all_supported_formats_complete(self, client, auth_headers, name, data, mime):
        res = client.post("/api/analysis/run", headers=auth_headers, files={"file": (name, data, mime)})
        assert res.status_code == 200, res.json()

    def test_same_image_gives_same_result(self, client, auth_headers, jpeg_file):
        first = client.post("/api/analysis/run", headers=auth_headers, files=jpeg_file).json()["result"]
        second = client.post("/api/analysis/run", headers=auth_headers, files=jpeg_file).json()["result"]
        assert (first["verdict"], first["confidence"]) == (second["verdict"], second["confidence"])
        assert first["id"] != second["id"]

    def test_temp_status_reports_image_not_retrievable(self, client, auth_headers, jpeg_file):
        image_id = client.post("/api/analysis/run", headers=auth_headers, files=jpeg_file).json()["image"]["image_id"]
        status = client.get(f"/api/analysis/temp/{image_id}", headers=auth_headers).json()
        assert status["retrievable"] is False
        assert status["deleted_at"]


# ---------------------------------------------------------------------------
# Authentication gate
# ---------------------------------------------------------------------------

class TestAuthGate:
    @pytest.mark.parametrize("path", ["/api/analysis/run", "/api/analysis/validate", "/api/analysis/start"])
    def test_anonymous_upload_rejected(self, client, jpeg_file, path):
        assert client.post(path, files=jpeg_file).status_code == 401
        assert temp_image_files() == []

    def test_unverified_user_cannot_upload(self, client, make_token, jpeg_file):
        headers = make_token("uid-new", verified=False)
        assert client.post("/api/analysis/run", headers=headers, files=jpeg_file).status_code == 403


# ---------------------------------------------------------------------------
# Validation before analysis
# ---------------------------------------------------------------------------

class TestValidation:
    @pytest.mark.parametrize(
        "name, data, mime, message",
        [
            ("empty.jpg", b"", "image/jpeg", "empty"),
            ("doc.pdf", b"%PDF-1.4", "application/pdf", "not supported"),
            ("anim.gif", b"GIF89a" + b"\x00" * 64, "image/gif", "not supported"),
            ("fake.jpg", b"not really an image", "image/jpeg", "could not read"),
            ("photo.png", JPEG_BYTES, "image/png", "does not match"),
            ("script.jpg.exe", JPEG_BYTES, "application/octet-stream", "not supported"),
        ],
        ids=["empty", "pdf", "gif", "garbage", "mismatched-extension", "double-extension"],
    )
    def test_invalid_upload_rejected_before_analysis(self, client, auth_headers, name, data, mime, message):
        res = client.post("/api/analysis/run", headers=auth_headers, files={"file": (name, data, mime)})
        assert res.status_code == 400
        assert message in res.json()["detail"]
        # Nothing stored, nothing counted against the quota
        assert temp_image_files() == []
        assert usage(client, auth_headers)["count_24h"] == 0

    def test_oversized_upload_rejected(self, client, auth_headers):
        big = JPEG_BYTES + b"\x00" * (MAX_UPLOAD_BYTES + 1 - len(JPEG_BYTES))
        res = client.post("/api/analysis/run", headers=auth_headers, files={"file": ("big.jpg", big, "image/jpeg")})
        assert res.status_code == 400
        assert "10 MB" in res.json()["detail"]

    def test_validate_endpoint_does_not_store_or_count(self, client, auth_headers, jpeg_file):
        res = client.post("/api/analysis/validate", headers=auth_headers, files=jpeg_file)
        assert res.status_code == 200
        assert res.json()["status"] == "validated"
        assert temp_image_files() == []
        assert usage(client, auth_headers)["count_24h"] == 0

    def test_missing_file_field_rejected(self, client, auth_headers):
        assert client.post("/api/analysis/run", headers=auth_headers).status_code == 422


# ---------------------------------------------------------------------------
# Quotas
# ---------------------------------------------------------------------------

class TestQuotas:
    def test_second_upload_blocked_while_one_is_active(self, client, db, auth_headers, jpeg_file):
        db.collection("analysis_usage").document("uid-alice").set({"active": True, "request_timestamps": []})
        res = client.post("/api/analysis/run", headers=auth_headers, files=jpeg_file)
        assert res.status_code == 429
        assert "in progress" in res.json()["detail"]

    def test_daily_limit_blocks_upload(self, client, db, auth_headers, jpeg_file):
        now = datetime.now(timezone.utc).isoformat()
        db.collection("analysis_usage").document("uid-alice").set(
            {"active": False, "request_timestamps": [now] * MAX_ANALYSES_PER_24H}
        )
        res = client.post("/api/analysis/run", headers=auth_headers, files=jpeg_file)
        assert res.status_code == 429
        assert "limit" in res.json()["detail"]
        assert temp_image_files() == []

    def test_old_requests_fall_out_of_the_24h_window(self, client, db, auth_headers, jpeg_file):
        old = "2020-01-01T00:00:00+00:00"
        db.collection("analysis_usage").document("uid-alice").set(
            {"active": False, "request_timestamps": [old] * MAX_ANALYSES_PER_24H}
        )
        res = client.post("/api/analysis/run", headers=auth_headers, files=jpeg_file)
        assert res.status_code == 200
        assert res.json()["usage"]["count_24h"] == 1

    def test_quotas_are_per_user(self, client, db, make_token, jpeg_file):
        alice, bob = make_token("uid-alice"), make_token("uid-bob", email="bob@example.com")
        db.collection("analysis_usage").document("uid-alice").set({"active": True, "request_timestamps": []})
        assert client.post("/api/analysis/run", headers=alice, files=jpeg_file).status_code == 429
        assert client.post("/api/analysis/run", headers=bob, files=jpeg_file).status_code == 200


# ---------------------------------------------------------------------------
# Stepwise path: /analysis/start → /analysis/finish
# ---------------------------------------------------------------------------

class TestStepwisePath:
    def start(self, client, headers, jpeg_file):
        res = client.post("/api/analysis/start", headers=headers, files=jpeg_file)
        assert res.status_code == 200
        return res.json()

    def test_start_stores_temporarily_and_finish_deletes(self, client, auth_headers, jpeg_file):
        started = self.start(client, auth_headers, jpeg_file)
        assert started["status"] == "processing"
        assert started["usage"]["active"] is True
        assert len(temp_image_files()) == 1

        image_id = started["image"]["image_id"]
        res = client.post("/api/analysis/finish", headers=auth_headers, data={"image_id": image_id, "outcome": "success"})
        assert res.status_code == 200
        assert res.json()["privacy"]["image_deleted"] is True
        assert res.json()["usage"]["active"] is False
        assert temp_image_files() == []

    @pytest.mark.parametrize("outcome, expected", [("cancelled", "cancelled"), ("failure", "failure"), ("bogus", "failure")])
    def test_finish_outcomes(self, client, auth_headers, jpeg_file, outcome, expected):
        image_id = self.start(client, auth_headers, jpeg_file)["image"]["image_id"]
        res = client.post("/api/analysis/finish", headers=auth_headers, data={"image_id": image_id, "outcome": outcome})
        assert res.json()["outcome"] == expected
        assert temp_image_files() == []

    def test_other_user_cannot_finish_or_inspect_image(self, client, make_token, jpeg_file):
        alice, mallory = make_token("uid-alice"), make_token("uid-mallory", email="m@example.com")
        image_id = self.start(client, alice, jpeg_file)["image"]["image_id"]

        assert client.post("/api/analysis/finish", headers=mallory, data={"image_id": image_id}).status_code == 403
        assert client.get(f"/api/analysis/temp/{image_id}", headers=mallory).status_code == 404
        assert len(temp_image_files()) == 1  # still Alice's

    def test_finish_twice_is_safe(self, client, auth_headers, jpeg_file):
        image_id = self.start(client, auth_headers, jpeg_file)["image"]["image_id"]
        client.post("/api/analysis/finish", headers=auth_headers, data={"image_id": image_id})
        again = client.post("/api/analysis/finish", headers=auth_headers, data={"image_id": image_id})
        assert again.status_code == 200
        assert again.json()["image"]["already_gone"] is True

    def test_abandoned_upload_purged_after_deadline(self, client, auth_headers, jpeg_file):
        image_id = self.start(client, auth_headers, jpeg_file)["image"]["image_id"]
        assert temp_images.purge_expired_temp_images() == 0  # still inside 60s

        # Client never calls /finish; backdate the deadline as if 60s passed
        meta_path = Path(temp_images.TEMP_UPLOAD_DIR) / f"{image_id}.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["delete_by"] = "2000-01-01T00:00:00+00:00"
        meta_path.write_text(json.dumps(meta), encoding="utf-8")

        assert temp_images.purge_expired_temp_images() == 1
        assert temp_image_files() == []
        assert temp_images.get_temp_meta(image_id)["delete_reason"] == "ttl_expired"
