"""Verify GROQ_API_KEY without printing the secret. Run from backend/: python check_groq_key.py"""
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)  # noqa: same as gemini_client

def main() -> int:
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        print("GROQ_API_KEY is not set.")
        print("Set it in backend/.env or: $env:GROQ_API_KEY='gsk_...'")
        return 1
    if not key.startswith("gsk_"):
        print("GROQ_API_KEY looks wrong (Groq keys usually start with gsk_).")
        return 1

    r = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
            "max_tokens": 5,
        },
        timeout=30,
    )
    data = r.json()
    if r.status_code == 200:
        print("GROQ_API_KEY is VALID — Groq accepted your key.")
        return 0
    msg = data.get("error", {}).get("message", r.text[:200])
    print(f"GROQ_API_KEY is INVALID — HTTP {r.status_code}: {msg}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
