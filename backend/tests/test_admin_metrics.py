from admin_metrics import aggregate_analysis_requests, aggregate_daily_metrics


def test_analysis_requests_group_by_week_and_classify_outcomes():
    result = aggregate_analysis_requests(
        [
            {"createdAt": "2026-01-05T10:00:00+00:00", "status": "success"},
            {"createdAt": "2026-01-06T10:00:00+00:00", "status": "failure"},
            {"createdAt": "2026-01-12T10:00:00+00:00", "status": "cancelled"},
            {"createdAt": "not-a-date", "status": "success"},
        ],
        interval="weekly",
    )

    assert result["buckets"] == [
        {
            "period": "2026-01-05",
            "totalAnalyses": 2,
            "successfulAnalyses": 1,
            "failedAnalyses": 1,
        },
        {
            "period": "2026-01-12",
            "totalAnalyses": 1,
            "successfulAnalyses": 0,
            "failedAnalyses": 1,
        },
    ]
    assert result["totals"] == {
        "totalAnalyses": 3,
        "successfulAnalyses": 1,
        "failedAnalyses": 2,
    }


def test_daily_metrics_group_into_months_and_derive_successes():
    result = aggregate_daily_metrics(
        [
            {"date": "2026-02-01", "totalAnalyses": 4, "totalFailures": 1},
            {"date": "2026-02-20", "totalAnalyses": 3, "totalFailures": 2},
            {"date": "missing", "totalAnalyses": 10, "totalFailures": 0},
        ],
        interval="monthly",
    )

    assert result["buckets"] == [
        {
            "period": "2026-02",
            "totalAnalyses": 7,
            "successfulAnalyses": 4,
            "failedAnalyses": 3,
        }
    ]


def test_invalid_interval_is_rejected():
    try:
        aggregate_analysis_requests([], interval="yearly")
    except ValueError as exc:
        assert str(exc) == "interval must be daily, weekly, or monthly"
    else:
        raise AssertionError("invalid interval should raise ValueError")
