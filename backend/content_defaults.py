"""Default Landing / About content used when Firestore has no published doc."""

from __future__ import annotations

from typing import Any

LANDING_DEFAULT: dict[str, Any] = {
    "heroTitle": "Deepfake Detection",
    "heroTagline": "Not every photo is real. Check first.",
    "heroCtaLabel": "Create account",
    "heroCtaHref": "/create-account",
    "heroImageSrc": "/assets/landing-hero.jpg",
    "heroVisible": True,
    "explainerLead": (
        "Edited and AI-made photos are easy to miss. Upload one to get an "
        "assessment of potential AI or manipulation, a confidence score, and a "
        "plain-language explanation."
    ),
    "explainerSteps": [
        {"icon": "image", "label": "Upload a photo"},
        {"icon": "shield-check", "label": "Scan for signs of AI or manipulation"},
        {"icon": "shield", "label": "Photos are never saved"},
    ],
    "explainerCtaLabel": "Create account",
    "explainerCtaHref": "/create-account",
    "explainerVisible": True,
    "footerDisclaimer": "A screening tool, not forensic proof.",
    "footerCopyright": "© 2026 Deepfake Detection",
}

ABOUT_DEFAULT: dict[str, Any] = {
    "introHeading": "Technology should make a difference.",
    "introDescription": (
        "We're a team of student developers passionate about building practical "
        "applications that make a real-world difference."
    ),
    "introVisible": True,
    "purposeHeading": "Why We're Building This",
    "purposeDescription": (
        "AI-generated images are becoming harder to distinguish from authentic "
        "content. We want to make image screening more accessible, understandable, "
        "and available to everyone."
    ),
    "purposeVisible": True,
    "accessHeading": "Built for Everyone.",
    "accessDescription": (
        "Our core image-screening experience is free and accessible to everyone."
    ),
    "accessDescriptionSecondary": (
        "An optional Premium membership is planned for access to additional AI "
        "models and expanded capabilities — including advanced options such as "
        "Claude Opus 5.5, subject to integration and availability. Membership is "
        "not available to purchase yet."
    ),
    "tryItLabel": "Try It Free",
    "tryItHref": "/create-account",
    "membershipLabel": "Explore Membership",
    "membershipNote": (
        "Premium membership is a future offering. There is no pricing or checkout "
        "yet — we'll share details when it becomes available."
    ),
    "accessVisible": True,
    "teamHeading": "Meet the People Behind the Project.",
    "teamDescription": (
        "A team of student developers working together to build technology with purpose."
    ),
    "teamVisible": True,
    "team": [
        {"id": "terry-kim", "name": "Terry Kim", "role": "Team Lead", "contribution": "", "photoSrc": ""},
        {"id": "lucy-kwak", "name": "Lucy Kwak", "role": "Product Manager", "contribution": "", "photoSrc": ""},
        {"id": "rojin-osia", "name": "Rojin Osia", "role": "Backend Developer", "contribution": "", "photoSrc": ""},
        {
            "id": "nattharut-natvongsaku",
            "name": "Nattharut Natvongsaku",
            "role": "Frontend Developer",
            "contribution": "",
            "photoSrc": "",
        },
        {"id": "trinity-ma", "name": "Trinity Ma", "role": "QA Engineer", "contribution": "", "photoSrc": ""},
    ],
    "footerDisclaimer": "A screening tool, not forensic proof.",
    "footerCopyright": "© 2026 Deepfake Detection",
}

PAGE_DEFAULTS: dict[str, dict[str, Any]] = {
    "landing": LANDING_DEFAULT,
    "about": ABOUT_DEFAULT,
}
