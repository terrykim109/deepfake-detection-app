
import logging
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv


API_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


def extract_error_detail(response: httpx.Response) -> str:
    """Extract a useful error message from an OpenRouter response."""
    try:
        data = response.json()
        return data.get("error", {}).get("message", response.text[:500])
    except (ValueError, AttributeError):
        return response.text[:500]


def extract_response_text(content) -> str:
    """Handle both string and text-part response content."""
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        return "".join(
            part["text"]
            for part in content
            if isinstance(part, dict)
            and isinstance(part.get("text"), str)
        ).strip()

    return ""


def main() -> int:
    env_path = (Path(__file__).resolve().parent / "../../.env").resolve()

    if not env_path.is_file():
        logger.error("Environment file not found: %s", env_path)
        return 1

    load_dotenv(env_path)

    api_key = os.getenv("OPENROUTER_API_KEY")

    if not api_key:
        logger.error("OPENROUTER_API_KEY is missing from .env")
        return 1

    logger.info("Connecting to OpenRouter...")
    logger.debug("API endpoint: %s", API_URL)
    logger.debug("Requested model: %s", MODEL)

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a helpful assistant. "
                    "Answer mathematical questions accurately."
                ),
            },
            {
                "role": "user",
                "content": (
                    "What is 15 + 27? "
                    "Explain your answer briefly."
                ),
            },
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    start_time = time.monotonic()

    try:
        logger.debug("Sending chat completion request...")

        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                API_URL,
                headers=headers,
                json=payload,
            )

        if response.is_error:
            detail = extract_error_detail(response)
            logger.error(
                "OpenRouter returned HTTP %s: %s",
                response.status_code,
                detail,
            )
            return 1

        data = response.json()

        logger.info("OpenRouter request completed successfully.")

        choices = data.get("choices", [])

        if not choices:
            logger.error("OpenRouter returned no response choices.")
            return 1

        message = choices[0].get("message", {})
        answer = extract_response_text(message.get("content"))

        if not answer:
            logger.error("Model returned an empty or unsupported response.")
            return 1

        served_model = data.get("model", MODEL)
        elapsed = time.monotonic() - start_time

        logger.info("Received response from model: %s", served_model)
        logger.debug("Response processing completed.")
        logger.info("Request completed in %.2f seconds.", elapsed)

        print("\nModel response:")
        print(answer)

        return 0

    except httpx.TimeoutException:
        logger.error("OpenRouter request timed out.")
        return 1

    except httpx.RequestError as exc:
        logger.error("OpenRouter connection failed: %s", exc)
        return 1

    except ValueError as exc:
        logger.error("Invalid JSON response from OpenRouter: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
