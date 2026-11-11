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
# Room for verdict/summary plus up to 3 region findings (truncated JSON drops findings).
_MAX_TOKENS = 1600
_TEMPERATURE = 0.2  # Keep responses relatively consistent
_MAX_FINDINGS = 3  # Maximum suspicious regions retained per result
_DISAGREEMENT_THRESHOLD = 30

_PROMPT = """You are an image forensics assistant helping detect AI-generated or digitally manipulated photos.

Analyze the image for deepfake / AI-generation / heavy editing cues (unnatural textures, inconsistent lighting, warped anatomy, compression artifacts, etc.).

Respond with ONLY valid JSON (no markdown, no extra text):
{"verdict":"real"|"warn"|"fake","confidence":0-100,"summary":"one short sentence","findings":[{"label":"short title","explanation":"one tentative sentence","x":0.0,"y":0.0,"w":0.0,"h":0.0,"tip":"what the user should check when zoomed in","confidence":0-100}]}

Rules:
- confidence is manipulation likelihood: 0 = clearly authentic, 100 = clearly fake/AI-generated.
- verdict "fake" for strong manipulation signals, "warn" for inconclusive/mixed, "real" for little evidence of manipulation.
- summary must be one plain-English sentence suitable for end users.
- findings: up to 3 suspicious regions. Use empty [] when verdict is "real".
- x,y,w,h are normalized 0–1 relative to the full image (x,y = top-left of the region).
- explanations must be tentative cues (not definitive proof), e.g. "this area looks inconsistent because…".
- each finding's confidence is how suspicious that region is, 0–100.
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
    except json.JSONDecodeError as original_error:
        match = re.search(r"\{.*\}", text, re.DOTALL)

        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

        # Some free vision models stop mid-JSON at their output-token limit.
        # Recover required fields and any complete finding objects that made it through.
        verdict_match = re.search(
            r'"verdict"\s*:\s*"(?P<value>[^"]+)"',
            text,
            re.IGNORECASE,
        )
        confidence_match = re.search(
            r'"confidence"\s*:\s*(?P<value>-?\d+(?:\.\d+)?)',
            text,
            re.IGNORECASE,
        )
        summary_match = re.search(
            r'"summary"\s*:\s*"(?P<value>(?:\\.|[^"\\])*)',
            text,
            re.IGNORECASE | re.DOTALL,
        )

        if not (verdict_match and confidence_match and summary_match):
            raise original_error

        try:
            summary = json.loads(f'"{summary_match.group("value")}"').strip()
        except json.JSONDecodeError:
            summary = summary_match.group("value").strip()

        return {
            "verdict": verdict_match.group("value"),
            "confidence": confidence_match.group("value"),
            "summary": summary,
            "findings": _recover_findings_objects(text),
        }


def _recover_findings_objects(text: str) -> list[dict[str, Any]]:
    """Pull complete finding objects out of truncated model JSON."""
    recovered: list[dict[str, Any]] = []
    pattern = re.compile(
        r'\{\s*"label"\s*:\s*"(?P<label>(?:\\.|[^"\\])*)"\s*,\s*'
        r'"explanation"\s*:\s*"(?P<explanation>(?:\\.|[^"\\])*)"\s*,\s*'
        r'"x"\s*:\s*(?P<x>-?\d+(?:\.\d+)?)\s*,\s*'
        r'"y"\s*:\s*(?P<y>-?\d+(?:\.\d+)?)\s*,\s*'
        r'"w"\s*:\s*(?P<w>-?\d+(?:\.\d+)?)\s*,\s*'
        r'"h"\s*:\s*(?P<h>-?\d+(?:\.\d+)?)'
        # Optional teachable extras, listed after the box in the prompt
        r'(?:\s*,\s*"tip"\s*:\s*"(?P<tip>(?:\\.|[^"\\])*)")?'
        r'(?:\s*,\s*"confidence"\s*:\s*(?P<confidence>-?\d+(?:\.\d+)?))?\s*\}',
        re.IGNORECASE | re.DOTALL,
    )
    for match in pattern.finditer(text):
        if len(recovered) >= _MAX_FINDINGS:
            break
        try:
            label = json.loads(f'"{match.group("label")}"').strip()
            explanation = json.loads(f'"{match.group("explanation")}"').strip()
        except json.JSONDecodeError:
            label = match.group("label").strip()
            explanation = match.group("explanation").strip()
        item = {
            "label": label,
            "explanation": explanation,
            "x": match.group("x"),
            "y": match.group("y"),
            "w": match.group("w"),
            "h": match.group("h"),
        }
        if match.group("tip"):
            try:
                item["tip"] = json.loads(f'"{match.group("tip")}"')
            except json.JSONDecodeError:
                item["tip"] = match.group("tip")
        if match.group("confidence"):
            item["confidence"] = match.group("confidence")
        recovered.append(item)
    return recovered


_COORD_KEYS = ("x", "y", "w", "h")


def _coord(item: dict, key: str, scale: float) -> float:
    """Read one box coordinate, convert to 0–1, and clamp. Raises on bad input."""
    return _clamp01(float(item.get(key)) / scale)


def _coord_scale(items: list) -> float:
    """
    Some vision models answer in 0–100 percentages or 0–1000 despite the prompt.
    Pick one scale from the largest coordinate in the response so every box
    from that model is scaled the same way.
    """
    largest = 0.0
    for item in items:
        if not isinstance(item, dict):
            continue
        for key in _COORD_KEYS:
            try:
                largest = max(largest, float(item.get(key)))
            except (TypeError, ValueError):
                continue
    if largest > 100:
        return 1000.0
    if largest > 1:
        return 100.0
    return 1.0


def _region_confidence(value: Any) -> int | None:
    """Per-region score as 0–100; accepts a 0–1 probability too."""
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not 0 <= number <= 100:
        return None
    return int(round(number * 100 if number <= 1 else number))


def _parse_findings(raw: Any, *, verdict: str) -> list[dict[str, Any]]:
    if verdict == "real":
        return []

    if not isinstance(raw, list):
        return []

    scale = _coord_scale(raw)
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
            x, y, w, h = (_coord(item, key, scale) for key in _COORD_KEYS)
        except (TypeError, ValueError):
            continue

        # Keep box inside the image.
        w = min(w, 1.0 - x)
        h = min(h, 1.0 - y)

        if w <= 0.01 or h <= 0.01:
            continue

        finding: dict[str, Any] = {
            "id": f"f{index + 1}",
            "label": label[:80],
            "explanation": explanation[:280],
            "x": round(x, 4),
            "y": round(y, 4),
            "w": round(w, 4),
            "h": round(h, 4),
        }

        # Optional extras; dropped rather than failing the finding when malformed
        tip = str(item.get("tip") or "").strip()
        if tip:
            finding["tip"] = tip[:200]
        region_confidence = _region_confidence(item.get("confidence"))
        if region_confidence is not None:
            finding["confidence"] = region_confidence

        findings.append(finding)

    return findings


def _parse_model_payload(model: str, payload: dict) -> _ModelScore:
    choices = payload.get("choices") or []

    if not choices:
        raise ValueError("no choices in response")

    message = choices[0].get("message") or {}
    content = message.get("content")

    if isinstance(content, list):
        parts = []
        for part in content:
            if not isinstance(part, dict):
                continue
            text = part.get("text")
            if isinstance(text, str):
                parts.append(text)
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

    # Keep region cues whenever any model supplied them, unless every model
    # agreed the image looks real (ensemble verdict real + no warn/fake votes).
    findings = _pick_findings(scores, confidence)
    if verdict == "real" and not any(s.verdict in {"warn", "fake"} for s in scores):
        findings = []

    return DetectionResult(
        verdict=verdict,
        verdict_label=_VERDICT_LABELS[verdict],
        confidence=confidence,
        summary=summary or _FALLBACK_SUMMARIES[verdict],
        provider="openrouter",
        findings=findings,
        explanation_method="AI vision model description (approximate areas)" if findings else "",
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