"""Groq LLM integration for structured API analysis (hackathon: Groq, not Gemini)."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

import requests
from dotenv import load_dotenv

from models import normalize_analysis_result

_ENV_FILE = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_FILE, override=True)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

SYSTEM_PROMPT = """You are SmartDevTool, an expert API integration engineer for hackathon demos.
Rules:
- Use ONLY facts from the provided documentation excerpt. Do not invent endpoints.
- Match endpoints to the developer's use case; omit irrelevant endpoints (max 6).
- Output ONLY valid JSON matching the schema. No markdown fences, no commentary.
- wrapper_class and quick_start must be runnable {language} code with error handling and auth placeholders.
- confidence scores must be integers 0-100 reflecting doc clarity for each dimension.
- If auth is required, state it clearly in authentication and gotchas."""


def get_groq_api_key() -> str:
    return os.getenv("GROQ_API_KEY", "").strip()


def _build_user_prompt(docs_content: str, use_case: str, language: str) -> str:
    schema = {
        "api_name": "string",
        "summary": "string (1-2 sentences)",
        "base_url": "string (API base URL only)",
        "endpoints": [
            {
                "path": "string",
                "method": "GET|POST|PUT|DELETE|PATCH",
                "purpose": "string",
                "params": ["string"],
                "example_response": "string",
                "testable": "boolean (true only for public GET without auth)",
            }
        ],
        "authentication": {
            "type": "string",
            "explanation": "string",
            "header_example": "string",
        },
        "confidence": {
            "auth_extraction": "int",
            "endpoint_matching": "int",
            "request_body_structure": "int",
            "sdk_completeness": "int",
            "overall": "int",
        },
        "wrapper_class": "string (full class)",
        "quick_start": "string (install + env + minimal example)",
        "sdk_suggestion": "string",
        "gotchas": ["string"],
        "manual_hours_saved": "number",
    }
    return (
        f"Target language: {language}\n"
        f"Developer use case: {use_case}\n\n"
        f"Required JSON schema:\n{json.dumps(schema, indent=2)}\n\n"
        f"Documentation excerpt:\n{docs_content}"
    )


def _parse_json_response(text: str) -> dict:
    text = text.strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("AI response did not contain JSON")

    text = text[start : end + 1]
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Common fix: trailing commas
        fixed = re.sub(r",\s*}", "}", text)
        fixed = re.sub(r",\s*]", "]", fixed)
        return json.loads(fixed)


def analyze_api_docs(docs_content: str, use_case: str, language: str) -> dict:
    api_key = get_groq_api_key()
    if not api_key:
        raise RuntimeError(
            "Groq API key is missing. Add GROQ_API_KEY to backend/.env and restart the server."
        )

    user_prompt = _build_user_prompt(docs_content, use_case, language)
    system = SYSTEM_PROMPT.replace("{language}", language)

    print(f"[SmartDevTool] Groq request ({len(user_prompt)} chars)...")

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.15,
        "max_tokens": 2800,
        "response_format": {"type": "json_object"},
    }

    response = requests.post(
        GROQ_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=45,
    )

    if response.status_code == 400 and "response_format" in (response.text or "").lower():
        payload.pop("response_format", None)
        response = requests.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=45,
        )

    resp_json = response.json()
    print(f"[SmartDevTool] Groq status: {response.status_code}")

    if response.status_code != 200:
        err = resp_json.get("error", {})
        msg = err.get("message", response.text[:200])
        raise RuntimeError(f"Groq error: {msg}")

    choices = resp_json.get("choices") or []
    if not choices:
        raise RuntimeError("Groq returned an empty response")

    text = choices[0]["message"]["content"].strip()
    print(f"[SmartDevTool] Got {len(text)} chars")

    parsed = _parse_json_response(text)
    return normalize_analysis_result(parsed)
