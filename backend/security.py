"""URL validation and SSRF protection."""
from urllib.parse import urlparse
import ipaddress
import re

ALLOWED_SCHEMES = {"http", "https"}
BLOCKED_HOSTS = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
}
PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
]


def validate_public_http_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        raise ValueError("URL is required")
    if len(url) > 2048:
        raise ValueError("URL is too long")

    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValueError("Only http and https URLs are allowed")
    if not parsed.netloc:
        raise ValueError("Invalid URL — missing host")

    host = parsed.hostname
    if not host:
        raise ValueError("Invalid URL — missing hostname")

    host_lower = host.lower()
    if host_lower in BLOCKED_HOSTS:
        raise ValueError("Local or internal URLs are not allowed")

    if host_lower.endswith((".local", ".internal", ".localhost")):
        raise ValueError("Internal hostnames are not allowed")

    # Block obvious private IPv4 literals
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", host_lower):
        try:
            ip = ipaddress.ip_address(host_lower)
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                raise ValueError("Private IP addresses are not allowed")
        except ValueError as e:
            if "not allowed" in str(e):
                raise
            raise ValueError("Invalid IP address in URL") from e

    return url


def sanitize_user_text(text: str, max_len: int = 2000) -> str:
    """Reduce prompt-injection surface in user-provided fields."""
    text = (text or "").strip()[:max_len]
    text = text.replace("\x00", "")
    for marker in (
        "ignore previous",
        "ignore all previous",
        "disregard previous",
        "system:",
        "you are now",
        "new instructions:",
    ):
        text = text.replace(marker, "")
    return text
