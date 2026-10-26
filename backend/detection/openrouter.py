# OpenRouter vision-model ensemble provider

from __future__ import annotations

import base64
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from statistics import median
from typing import Any

import httpx

from config import OPENROUTER_API_KEY, OPENROUTER_MODELS
from detection.base import DetectionError, DetectionResult

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_TIMEOUT_SECONDS = 45.0 
_MAX_TOKENS = 600 
_TEMPERATURE = 0.2 # Keep responses relatively consistent
_MAX_FINDINGS = 3 # Maximum suspicious regions retained per result
_DISAGREEMENT_THRESHOLD = 30 

_PROMPT = """You are an image forensics assistant helping detect AI-generated or digitally manipulated photos.

Analyze the image for deepfake / AI-generation / heavy editing cues (unnatural textures, inconsistent lighting, warped anatomy, compression artifacts, etc.).

Respond with ONLY valid JSON (no markdown, no extra text):
{"verdict":"real"|"warn"|"fake","confidence":0-100,"summary":"one short sentence","findings":[{"label":"short title","explanation":"one tentative sentence","x":0.0,"y":0.0,"w":0.0,"h":0.0}]}

Rules:
- confidence is manipulation likelihood: 0 = clearly authentic, 100 = clearly fake/AI-generated.
- verdict "fake" for strong manipulation signals, "warn" for inconclusive/mixed, "real" for little evidence of manipulation.
- summary must be one plain-English sentence suitable for end users.
- findings: up to 3 suspicious regions. Use empty [] when verdict is "real".
- x,y,w,h are normalized 0–1 relative to the full image (x,y = top-left of the region).
- explanations must be tentative cues (not definitive proof), e.g. "this area looks inconsistent because…".
"""

_VERDICT_LABELS = {
    "fake": "Likely manipulated",
    "warn": "Possible manipulation detected",
    "real": "No manipulation detected",
}

_FALLBACK_SUMMARIES = {
    "fake": (
        "Our analysis found patterns that often appear in AI-generated or "
        "edited images. Treat this as a strong signal to verify the source."
    ),
    "warn": (
        "Some signals were inconclusive. The image may be authentic or lightly "
        "edited — consider additional context before deciding."
    ),
    "real": (
        "We did not find strong deepfake indicators in this image. "
        "This is not a guarantee of authenticity."
    ),
}


@dataclass(frozen=True, slots=True)
class _ModelScore:
    """Store one model's assessment before ensemble aggregation."""
    model: str
    verdict: str
    confidence: int
    summary: str
    findings: list[dict[str, Any]] = field(default_factory=list)

# Keep normalized coordinates within the 0–1 range
def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))

# Use the supplied image type, falling back to the filename or JPEG.
def _normalize_content_type(content_type: str | None, filename: str | None) -> str:
    if content_type and content_type.startswith("image/"):
        return content_type.split(";")[0].strip().lower()

    name = (filename or "").lower()

    if name.endswith(".png"):
        return "image/png"
    if name.endswith(".webp"):
        return "image/webp"

    return "image/jpeg"


def _extract_json(text: str) -> dict:
    text = (text or "").strip()

    if not text:
        raise ValueError("empty model response")

    fence = re.search(
        r"```(?:json)?\s*(\{.*?\})\s*```",
        text,
        re.DOTALL | re.IGNORECASE,
    )

    if fence:
        return json.loads(fence.group(1))

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)

        if not match:
            raise

        return json.loads(match.group(0))


def _parse_findings(raw: Any, *, verdict: str) -> list[dict[str, Any]]:
    if verdict == "real":
        return []

    if not isinstance(raw, list):
        return []

    findings: list[dict[str, Any]] = []

    for index, item in enumerate(raw):
        if len(findings) >= _MAX_FINDINGS:
            break

        if not isinstance(item, dict):
            continue

        label = str(item.get("label") or "").strip()
        explanation = str(item.get("explanation") or "").strip()

        if not label or not explanation:
            continue

        try:
            x = _clamp01(float(item.get("x")))
            y = _clamp01(float(item.get("y")))
            w = _clamp01(float(item.get("w")))
            h = _clamp01(float(item.get("h")))
        except (TypeError, ValueError):
            continue

        # Keep box inside the image.
        w = min(w, 1.0 - x)
        h = min(h, 1.0 - y)

        if w <= 0 or h <= 0:
            continue

        findings.append(
            {
                "id": f"f{index + 1}",
                "label": label[:80],
                "explanation": explanation[:280],
                "x": round(x, 4),
                "y": round(y, 4),
                "w": round(w, 4),
                "h": round(h, 4),
            }
        )

    return findings


def _parse_model_payload(model: str, payload: dict) -> _ModelScore:
    choices = payload.get("choices") or []

    if not choices:
        raise ValueError("no choices in response")

    message = choices[0].get("message") or {}
    content = message.get("content")

    if isinstance(content, list):
        parts = [
            p.get("text", "")
            for p in content
            if isinstance(p, dict)
        ]
        content = "\n".join(parts)

    if not isinstance(content, str):
        raise ValueError("unexpected content type")

    data = _extract_json(content)

    verdict = str(data.get("verdict", "")).strip().lower()

    if verdict not in {"real", "warn", "fake"}:
        raise ValueError(f"invalid verdict: {verdict!r}")

    try:
        confidence = int(round(float(data.get("confidence"))))
    except (TypeError, ValueError) as exc:
        raise ValueError("invalid confidence") from exc

    confidence = max(0, min(100, confidence))

    summary = (
        str(data.get("summary") or "").strip()
        or _FALLBACK_SUMMARIES[verdict]
    )

    findings = _parse_findings(data.get("findings"), verdict=verdict)

    # Added: OpenRouter may return the actual model that served the request.
    # This is useful when using a dynamic router such as openrouter/free.
    served_model = str(payload.get("model") or model)

    return _ModelScore(
        model=served_model,
        verdict=verdict,
        confidence=confidence,
        summary=summary,
        findings=findings,
    )


def _call_model(
    *,
    client: httpx.Client,
    api_key: str,
    model: str,
    data_url: str,
) -> _ModelScore:
    response = client.post(
        _OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://localhost",
            "X-Title": "Deepfake Detection",
        },
        json={
            "model": model,
            "temperature": _TEMPERATURE,
            "max_tokens": _MAX_TOKENS,

            # Request a JSON object from the vision model.
            "response_format": {"type": "json_object"},

            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url},
                        },
                    ],
                }
            ],
        },
    )

    # Handle HTTP errors, including rate limits and unavailable models.
    if response.status_code >= 400:
        detail = response.text[:300]
        raise RuntimeError(
            f"{model} HTTP {response.status_code}: {detail}"
        )

    # Handle responses that are not valid JSON.
    try:
        payload = response.json()
    except ValueError as exc:
        raise RuntimeError(
            f"{model} returned a non-JSON HTTP response "
            f"(status {response.status_code}): "
            f"{response.text[:200]!r}"
        ) from exc

    if not isinstance(payload, dict):
        raise RuntimeError(
            f"{model} returned an unexpected response format."
        )

    # Parse the model's JSON content into a detection result.
    try:
        return _parse_model_payload(model, payload)

    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        choices = payload.get("choices") or []

        first_choice = (
            choices[0]
            if choices and isinstance(choices[0], dict)
            else {}
        )

        message = first_choice.get("message") or {}

        if not isinstance(message, dict):
            message = {}

        content = message.get("content")
        preview = str(content or "")[:200].replace("\n", " ")

        raise RuntimeError(
            f"{model} returned unusable model content: {exc}; "
            f"response preview={preview!r}"
        ) from exc


def _verdict_from_score(score: int) -> str:
    if score >= 70:
        return "fake"
    if score >= 40:
        return "warn"
    return "real"


def _pick_findings(
    scores: list[_ModelScore],
    avg: int,
) -> list[dict[str, Any]]:
    if not scores:
        return []

    # Prefer findings from the model closest to the ensemble's central score.
    ordered = sorted(scores, key=lambda s: abs(s.confidence - avg))

    for score in ordered:
        if score.findings:
            return score.findings[:_MAX_FINDINGS]

    for score in scores:
        if score.findings:
            return score.findings[:_MAX_FINDINGS]

    return []


def _combine(scores: list[_ModelScore]) -> DetectionResult:
    # Added: use the median instead of the average so one extreme score
    # has less influence on the combined result.
    confidence = int(round(median(s.confidence for s in scores)))

    verdict = _verdict_from_score(confidence)

    # Added: detect disagreement between the model verdicts and their scores.
    model_verdicts = {s.verdict for s in scores}
    score_values = [s.confidence for s in scores]
    score_spread = max(score_values) - min(score_values)

    disagreement = (
        len(scores) > 1
        and len(model_verdicts) > 1
        and score_spread >= _DISAGREEMENT_THRESHOLD
    )

    # If models disagree substantially, avoid presenting a confident verdict.
    if disagreement:
        verdict = "warn"

    # Pick the model whose score is closest to the ensemble's median.
    best = min(scores, key=lambda s: abs(s.confidence - confidence))

    # Count the most common model verdict for the summary.
    verdict_counts = {
        label: sum(1 for s in scores if s.verdict == label)
        for label in ("real", "warn", "fake")
    }
    most_common_votes = max(verdict_counts.values())

    summary = best.summary

    if len(scores) > 1:
        if disagreement:
            summary = (
                f"{summary} The models disagreed substantially, so this "
                f"assessment is inconclusive. The median manipulation score "
                f"was {confidence}/100."
            )
        else:
            summary = (
                f"{summary} (Ensemble: {most_common_votes}/{len(scores)} "
                f"models shared the most common verdict; median manipulation "
                f"score {confidence}/100.)"
            )

    # Removed the old artificial minimum of 55 for "real" results.
    # The returned score now matches the ensemble's median score.
    findings = (
        _pick_findings(scores, confidence)
        if verdict != "real"
        else []
    )

    return DetectionResult(
        verdict=verdict,
        verdict_label=_VERDICT_LABELS[verdict],
        confidence=confidence,
        summary=summary or _FALLBACK_SUMMARIES[verdict],
        provider="openrouter",
        findings=findings,
    )


class OpenRouterEnsembleDetector:
    """
    Calls configured OpenRouter vision models in parallel.

    Successful responses are combined even when some models fail.
    An error is raised only when every configured model fails.
    """

    name = "openrouter"

    def analyze(
        self,
        *,
        image_bytes: bytes,
        filename: str | None,
        content_type: str | None,
    ) -> DetectionResult:
        if not image_bytes:
            raise DetectionError(
                "The analysis service could not read that image. "
                "Please try uploading again."
            )

        api_key = (OPENROUTER_API_KEY or "").strip()

        if not api_key:
            raise DetectionError(
                "OpenRouter detection is not configured. "
                "Set OPENROUTER_API_KEY and restart the server."
            )

        models = [
            m for m in (OPENROUTER_MODELS or [])
            if m
        ]

        if not models:
            raise DetectionError(
                "No OpenRouter models are configured."
            )

        mime = _normalize_content_type(content_type, filename)
        b64 = base64.b64encode(image_bytes).decode("ascii")
        data_url = f"data:{mime};base64,{b64}"

        scores: list[_ModelScore] = []
        errors: list[str] = []

        with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
            with ThreadPoolExecutor(max_workers=len(models)) as pool:
                futures = {
                    pool.submit(
                        _call_model,
                        client=client,
                        api_key=api_key,
                        model=model,
                        data_url=data_url,
                    ): model
                    for model in models
                }

                for future in as_completed(futures):
                    model = futures[future]

                    try:
                        scores.append(future.result())
                    except Exception as exc:
                        # Keep failed-model details for diagnosing provider errors.
                        errors.append(f"{model}: {exc}")

        # Keep using any successful model results rather than failing
        # the entire analysis because one or two providers were unavailable.
        if not scores:
            # Keep technical provider errors in server logs only.
            print(
                "[openrouter] all models failed: "
                + ("; ".join(errors[:3]) if errors else "unknown error")
            )
            raise DetectionError(
                "We couldn't analyze this image right now. "
                "Please try again in a moment."
            )

        return _combine(scores)