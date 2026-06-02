"""Smart DevTool API — production-ready FastAPI backend."""
from __future__ import annotations

import asyncio
import json
from functools import partial

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from gemini_client import analyze_api_docs, get_groq_api_key
from models import AnalyzeRequest, TestEndpointRequest
from scraper import scrape_docs

app = FastAPI(
    title="Smart DevTool API",
    version="1.1.0",
    description="API documentation → integration SDK generator",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        loc = " → ".join(str(x) for x in err.get("loc", []) if x != "body")
        messages.append(f"{loc}: {err.get('msg', 'invalid')}" if loc else err.get("msg", "invalid"))
    return JSONResponse(status_code=422, content={"detail": "; ".join(messages)})


@app.get("/")
def root():
    return {
        "message": "Smart DevTool is running",
        "version": "1.1.0",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "groq_api_key_configured": bool(get_groq_api_key()),
    }


def _interpret_test_status(status_code: int) -> dict:
    """Developer-friendly test results — auth/rate-limit are not failures."""
    if status_code == 200:
        return {
            "category": "success",
            "title": "Live response received",
            "message": "The endpoint responded successfully. Review the sample payload below.",
            "success": True,
        }
    if status_code in (401, 403):
        return {
            "category": "auth_required",
            "title": "Endpoint discovered — authentication required",
            "message": (
                f"HTTP {status_code}: This endpoint exists but requires credentials "
                "(API key, OAuth token, or signed request). Add your key per the Auth tab."
            ),
            "success": True,
        }
    if status_code == 429:
        return {
            "category": "rate_limit",
            "title": "Endpoint reachable — rate limited",
            "message": (
                f"HTTP {status_code}: The API is responding but throttling requests. "
                "Retry after a short delay or upgrade your plan."
            ),
            "success": True,
        }
    if status_code == 404:
        return {
            "category": "not_found",
            "title": "Path not found on server",
            "message": (
                f"HTTP {status_code}: Base URL or path may need query parameters. "
                "Check required params in the endpoint card."
            ),
            "success": False,
        }
    if 400 <= status_code < 500:
        return {
            "category": "client_error",
            "title": f"Client error ({status_code})",
            "message": "The server rejected the request — often missing query params or headers.",
            "success": False,
        }
    return {
        "category": "server_error",
        "title": f"Server error ({status_code})",
        "message": "The upstream API returned an error. Your integration code should handle this status.",
        "success": False,
    }


@app.post("/test-endpoint")
async def test_endpoint(request: TestEndpointRequest):
    """Server-side GET probe (avoids browser CORS) with friendly status interpretation."""
    loop = asyncio.get_event_loop()
    try:
        def _probe():
            return requests.get(
                request.url,
                headers={"Accept": "application/json", "User-Agent": "SmartDevTool-Test/1.0"},
                timeout=8,
                allow_redirects=True,
            )

        resp = await loop.run_in_executor(None, _probe)
        interpretation = _interpret_test_status(resp.status_code)
        try:
            body_preview = json.dumps(resp.json(), indent=2)[:1200]
        except Exception:
            body_preview = (resp.text or "")[:1200]

        return {
            "status_code": resp.status_code,
            "body_preview": body_preview,
            **interpretation,
        }
    except requests.exceptions.Timeout:
        return {
            "status_code": 0,
            "category": "timeout",
            "title": "Request timed out",
            "message": "The API did not respond within 8 seconds. Endpoint may still be valid.",
            "success": False,
            "body_preview": "",
        }
    except requests.exceptions.RequestException as e:
        return {
            "status_code": 0,
            "category": "network",
            "title": "Could not reach endpoint",
            "message": str(e)[:300],
            "success": False,
            "body_preview": "",
        }


@app.post("/analyze")
async def analyze(request: AnalyzeRequest):
    loop = asyncio.get_event_loop()
    try:
        docs_content = await loop.run_in_executor(
            None, partial(scrape_docs, request.docs_url)
        )
        print(f"[SmartDevTool] Scraped {len(docs_content)} chars from {request.docs_url}")

        result = await loop.run_in_executor(
            None,
            partial(
                analyze_api_docs,
                docs_content,
                request.use_case,
                request.language,
            ),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception as e:
        print(f"[SmartDevTool] Error: {e}")
        raise HTTPException(status_code=500, detail="Analysis failed. Please try again.") from e
