"""HTTP transport for provider catalog requests."""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class FetchError(RuntimeError):
    pass


def _fetch_browser_text(url: str, *, headers: dict[str, str]) -> str:
    """Use a matching Chrome TLS/HTTP profile for public catalog navigation."""
    try:
        from curl_cffi import requests as browser_requests
    except ImportError as exc:
        raise FetchError(
            "The site returned HTTP 403 and the browser transport is missing. "
            "Run: python -m pip install -e ."
        ) from exc

    # Let impersonation generate version-specific browser headers that match
    # its TLS/HTTP profile, instead of combining it with an unrelated Chrome UA.
    browser_headers = {
        key: value for key, value in headers.items()
        if key.lower() != "user-agent" and not key.lower().startswith("sec-ch-ua")
    }
    browser_headers.setdefault("Accept-Language", "en-US,en;q=0.9,he-IL;q=0.8,he;q=0.7")
    try:
        with browser_requests.Session(impersonate="chrome") as session:
            response = session.get(url, headers=browser_headers, timeout=(10, 30))
            response.raise_for_status()
            return response.content.decode("utf-8-sig")
    except browser_requests.RequestsError as exc:
        raise FetchError(f"Browser catalog request failed for {url}: {exc}") from exc


def fetch_text(
    url: str, *, headers: dict[str, str], browser_fallback: bool = False,
) -> str:
    retries = Retry(
        total=3, backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}), respect_retry_after_header=True,
    )
    with requests.Session() as session:
        session.headers.update({
            "User-Agent": "PlayNextCatalog/0.1",
            "Accept-Language": "en-US,en;q=0.9,he-IL;q=0.8,he;q=0.7",
        })
        session.mount("https://", HTTPAdapter(max_retries=retries))
        try:
            response = session.get(url, headers=headers, timeout=(10, 30))
            if response.status_code == 403 and browser_fallback:
                return _fetch_browser_text(url, headers=headers)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise FetchError(f"Catalog request failed for {url}: {exc}") from exc
        # Both captured provider responses are UTF-8. Decode explicitly so an
        # HTML response without a charset cannot turn Hebrew into mojibake.
        return response.content.decode("utf-8-sig")
