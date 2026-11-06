from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Iterable


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _period_key(value: datetime, interval: str) -> str:
    value = value.astimezone(timezone.utc)
    if interval == "daily":
        return value.strftime("%Y-%m-%d")
    if interval == "weekly":
        start = value.date()
        start = start.fromordinal(start.toordinal() - start.weekday())
        return start.isoformat()
    return value.strftime("%Y-%m")


def _empty_bucket() -> dict[str, int]:
    return {
        "totalAnalyses": 0,
        "successfulAnalyses": 0,
        "failedAnalyses": 0,
    }


def aggregate_analysis_requests(
    records: Iterable[dict[str, Any]],
    *,
    interval: str,
) -> dict[str, Any]:
    if interval not in {"daily", "weekly", "monthly"}:
        raise ValueError("interval must be daily, weekly, or monthly")

    buckets: dict[str, dict[str, int]] = defaultdict(_empty_bucket)
    for record in records:
        timestamp = (
            _parse_datetime(record.get("completedAt"))
            or _parse_datetime(record.get("createdAt"))
        )
        if timestamp is None:
            continue
        bucket = buckets[_period_key(timestamp, interval)]
        bucket["totalAnalyses"] += 1
        if str(record.get("status", "")).lower() in {"success", "completed"}:
            bucket["successfulAnalyses"] += 1
        else:
            bucket["failedAnalyses"] += 1

    ordered = [
        {"period": period, **buckets[period]}
        for period in sorted(buckets)
    ]
    totals = _empty_bucket()
    for bucket in ordered:
        for key in totals:
            totals[key] += bucket[key]
    return {"interval": interval, "totals": totals, "buckets": ordered}


def aggregate_daily_metrics(
    metrics: Iterable[dict[str, Any]],
    *,
    interval: str,
) -> dict[str, Any]:
    if interval not in {"daily", "weekly", "monthly"}:
        raise ValueError("interval must be daily, weekly, or monthly")

    buckets: dict[str, dict[str, int]] = defaultdict(_empty_bucket)
    for metric in metrics:
        timestamp = _parse_datetime(metric.get("date"))
        if timestamp is None:
            continue
        bucket = buckets[_period_key(timestamp, interval)]
        total = _number(metric.get("totalAnalyses"))
        failures = _number(metric.get("totalFailures"))
        bucket["totalAnalyses"] += total
        bucket["failedAnalyses"] += failures
        bucket["successfulAnalyses"] += max(0, total - failures)

    ordered = [
        {"period": period, **buckets[period]}
        for period in sorted(buckets)
    ]
    totals = _empty_bucket()
    for bucket in ordered:
        for key in totals:
            totals[key] += bucket[key]
    return {"interval": interval, "totals": totals, "buckets": ordered}


def _number(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0
