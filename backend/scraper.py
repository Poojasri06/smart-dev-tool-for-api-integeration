"""Documentation scraper: same-domain crawl, max 5 pages, fast extraction."""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlparse, urldefrag

import requests
from bs4 import BeautifulSoup

MAX_PAGES = 5
MAX_CHARS = 7000
PAGE_TIMEOUT = 6
TOTAL_TIMEOUT = 12
USER_AGENT = "SmartDevTool/1.0 (+https://github.com/smartdevtool; docs-scraper)"

DOC_KEYWORDS = re.compile(
    r"(api|endpoint|auth|token|reference|rest|graphql|webhook|request|response)",
    re.I,
)


def _same_domain(base: str, candidate: str) -> bool:
    return urlparse(base).netloc.lower() == urlparse(candidate).netloc.lower()


def _normalize_link(base_url: str, href: str | None) -> str | None:
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return None
    absolute = urldefrag(urljoin(base_url, href))[0]
    parsed = urlparse(absolute)
    if parsed.scheme not in ("http", "https"):
        return None
    if not _same_domain(base_url, absolute):
        return None
    return absolute


def _extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe", "noscript"]):
        tag.decompose()

    main = soup.find("main") or soup.find("article") or soup.find(id=re.compile(r"content|main|docs", re.I))
    root = main if main else soup.body or soup
    text = root.get_text(separator=" ", strip=True)
    text = re.sub(r"[^\x20-\x7E\n]", " ", text)
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


def _fetch_page(url: str, session: requests.Session) -> tuple[str, str, list[str]]:
    """Returns (url, text, outbound_links)."""
    resp = session.get(url, timeout=PAGE_TIMEOUT)
    resp.raise_for_status()
    content_type = resp.headers.get("Content-Type", "")
    if "html" not in content_type.lower() and "text" not in content_type.lower():
        return url, "", []

    text = _extract_text(resp.text)
    soup = BeautifulSoup(resp.text, "html.parser")
    links: list[str] = []
    for a in soup.find_all("a", href=True):
        link = _normalize_link(url, a.get("href"))
        if link and link not in links:
            links.append(link)
    return url, text, links


def _score_link(url: str) -> int:
    path = urlparse(url).path.lower()
    score = 0
    if DOC_KEYWORDS.search(path) or DOC_KEYWORDS.search(url):
        score += 3
    if any(x in path for x in ("/api", "/reference", "/docs", "/rest", "/guide")):
        score += 2
    if path.count("/") <= 4:
        score += 1
    return score


def scrape_docs(url: str) -> str:
    """
    Crawl up to MAX_PAGES on the same domain, prioritizing doc-like links.
    Raises on total failure; never returns fake 'docs' on error.
    """
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    visited: set[str] = set()
    chunks: list[str] = []
    queue: list[str] = [urldefrag(url)[0]]

    with ThreadPoolExecutor(max_workers=3) as pool:
        while queue and len(visited) < MAX_PAGES:
            batch: list[str] = []
            while queue and len(batch) < MAX_PAGES - len(visited):
                next_url = queue.pop(0)
                if next_url in visited:
                    continue
                visited.add(next_url)
                batch.append(next_url)

            futures = {pool.submit(_fetch_page, u, session): u for u in batch}
            new_links: list[str] = []

            for fut in as_completed(futures, timeout=TOTAL_TIMEOUT):
                try:
                    page_url, text, links = fut.result()
                except Exception:
                    continue
                if text:
                    chunks.append(f"--- PAGE: {page_url} ---\n{text}")
                for link in links:
                    if link not in visited and link not in queue:
                        new_links.append(link)

            new_links.sort(key=_score_link, reverse=True)
            for link in new_links:
                if link not in queue and len(queue) + len(visited) < MAX_PAGES * 2:
                    queue.append(link)

    if not chunks:
        raise ValueError(
            "Could not extract documentation from this URL. "
            "Try a direct API reference page (e.g. /api or /docs)."
        )

    combined = "\n\n".join(chunks)
    return combined[:MAX_CHARS]
