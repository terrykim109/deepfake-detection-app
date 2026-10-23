import base64
import json
from pathlib import Path

import httpx
from config import OPENROUTER_API_KEY, OPENROUTER_MODELS
from detection import openrouter as orouter

# Load the test image from the sample photos folder.
img = Path(__file__).resolve().parent / "sample photos" / "sample_deepfake.jpg"

if not img.is_file():
    raise FileNotFoundError(f"Image not found: {img}")

print("IMAGE FOUND:", img)

raw = img.read_bytes()
data_url = "data:image/jpeg;base64," + base64.b64encode(raw).decode("utf-8")

key = OPENROUTER_API_KEY.strip()
if not key:
    raise RuntimeError("OPENROUTER_API_KEY missing. Check your .env file.")

with httpx.Client(timeout=45.0) as client:
    for model in OPENROUTER_MODELS:
        print("\n" + "=" * 70)
        print("MODEL:", model)

        try:
            body = {
                "model": model,
                "temperature": orouter._TEMPERATURE,
                "max_tokens": orouter._MAX_TOKENS,
                "response_format": {"type": "json_object"},
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": orouter._PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url},
                        },
                    ],
                }],
            }

            if model.startswith("nvidia/nemotron-3.5-super-vl"):
                body["reasoning"] = {"effort": "none"}

            response = client.post(
                orouter._OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://localhost",
                    "X-Title": "Deepfake Detection",
                },
                json=body,
            )

            print("HTTP STATUS:", response.status_code)
            print("FULL RAW RESPONSE:")
            print(response.text[:12000])

            try:
                payload = response.json()
            except ValueError:
                print("ERROR: Response is not valid JSON.")
                continue

            print("SERVED MODEL:", payload.get("model"))
            print("API ERROR:", json.dumps(
                payload.get("error"), indent=2, ensure_ascii=False
            ))

            choices = payload.get("choices") or []
            if not choices:
                print("NO CHOICES RETURNED")
                print("USAGE:", json.dumps(payload.get("usage"), indent=2))
                continue

            choice = choices[0]
            message = choice.get("message") or {}

            print("FINISH REASON:", choice.get("finish_reason"))
            print("MESSAGE FIELDS:", list(message.keys()))
            print("CONTENT:", repr(message.get("content")))
            print("REASONING:", repr(message.get("reasoning")))
            print("USAGE:", json.dumps(
                payload.get("usage"), indent=2, ensure_ascii=False
            ))

        except Exception as exc:
            print("REQUEST FAILED:", type(exc).__name__, str(exc))
