"""Request/response schemas with validation."""
from typing import Any

from pydantic import BaseModel, Field, field_validator

from security import sanitize_user_text, validate_public_http_url


class AnalyzeRequest(BaseModel):
    docs_url: str = Field(..., min_length=8, max_length=2048)
    use_case: str = Field(..., min_length=3, max_length=2000)
    language: str = Field(..., min_length=2, max_length=32)

    @field_validator("docs_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        return validate_public_http_url(v)

    @field_validator("use_case")
    @classmethod
    def validate_use_case(cls, v: str) -> str:
        return sanitize_user_text(v, 2000)

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        allowed = {"Python", "JavaScript", "TypeScript", "Java", "Go", "PHP"}
        if v not in allowed:
            raise ValueError(f"Language must be one of: {', '.join(sorted(allowed))}")
        return v


class TestEndpointRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)
    method: str = Field(default="GET", max_length=8)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        return validate_public_http_url(v)

    @field_validator("method")
    @classmethod
    def validate_method(cls, v: str) -> str:
        m = (v or "GET").upper()
        if m != "GET":
            raise ValueError("Only GET test requests are supported")
        return m


def normalize_confidence(raw: dict[str, Any] | None) -> dict[str, int]:
    defaults = {
        "auth_extraction": 75,
        "endpoint_matching": 75,
        "request_body_structure": 75,
        "sdk_completeness": 75,
        "overall": 75,
    }
    if not raw:
        return defaults
    out = {}
    for key in defaults:
        try:
            val = int(float(raw.get(key, defaults[key])))
            out[key] = max(0, min(100, val))
        except (TypeError, ValueError):
            out[key] = defaults[key]
    if "overall" not in raw or raw.get("overall") is None:
        scores = [out[k] for k in defaults if k != "overall"]
        out["overall"] = round(sum(scores) / len(scores)) if scores else 75
    return out


def normalize_analysis_result(data: dict[str, Any]) -> dict[str, Any]:
    """Ensure consistent shape for the frontend."""
    data.setdefault("api_name", "API Integration")
    data.setdefault("summary", "")
    data.setdefault("base_url", "")
    data.setdefault("endpoints", [])
    data.setdefault("gotchas", [])
    data.setdefault("wrapper_class", "")
    data.setdefault("quick_start", "")
    data.setdefault("sdk_suggestion", "")
    data.setdefault("manual_hours_saved", 4)

    if not isinstance(data.get("endpoints"), list):
        data["endpoints"] = []

    auth = data.get("authentication")
    if not isinstance(auth, dict):
        data["authentication"] = {
            "type": "Unknown",
            "explanation": "Review the official documentation for authentication requirements.",
            "header_example": "",
        }

    data["confidence"] = normalize_confidence(
        data.get("confidence") if isinstance(data.get("confidence"), dict) else None
    )
    return data
