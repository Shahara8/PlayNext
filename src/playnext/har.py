"""Import provider catalog response bodies from saved HAR files, without HTTP."""

import base64
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

from .models import Provider
from .parsers import ParsedCatalog, parse_partner_response, parse_yes_response


def _body(entry: dict[str, Any]) -> str:
    content = entry.get("response", {}).get("content", {})
    text = content.get("text", "")
    if content.get("encoding") == "base64":
        return base64.b64decode(text, validate=True).decode("utf-8-sig")
    return text


def _capture_date(entry: dict[str, Any]) -> date | None:
    timestamp = entry.get("startedDateTime")
    if not timestamp:
        return None
    captured = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if captured.utcoffset() is None:
        raise ValueError("HAR startedDateTime must include a timezone")
    return captured.astimezone(timezone.utc).date()


@dataclass
class HarExtraction(ParsedCatalog):
    matched_responses: int = 0
    captured_at: set[str] = field(default_factory=set)

    def report(self, source: Path) -> dict[str, Any]:
        return {
            "provider": self.provider.value,
            "source_file": source.name,
            "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "coverage": "partial",
            "live_requests_made": False,
            "captured_at": sorted(self.captured_at),
            "matched_responses": self.matched_responses,
            **self.summary(),
            "notes": [
                "Extracted only from saved website responses; full VOD coverage is unproven.",
                "Region IL is the configured market for these Israeli providers.",
                "Titles retain displayed season/dubbing text; whitespace is normalized.",
                "Missing fields remain null, including IMDb/TMDB IDs.",
                "last_verified is the UTC capture date: the last observation in the provider listing.",
                "CMS creation/update dates are not provider addition/removal dates.",
                "Informational CMS/page paths are not exported as playback watch_url values.",
                "Partner types come only from explicit movie/series categories or season labels.",
                "Seasons come only from numbered title labels, not assumptions about other seasons.",
            ],
        }


def extract_har(source: Path, provider: Provider) -> HarExtraction:
    if provider not in (Provider.YES, Provider.PARTNER):
        raise ValueError("HAR extraction is implemented only for YES and Partner TV")
    document = json.loads(source.read_text(encoding="utf-8-sig"))
    entries = document.get("log", {}).get("entries", [])
    result = HarExtraction(provider)
    for entry in entries:
        request = entry.get("request", {})
        response = entry.get("response", {})
        url = urlsplit(request.get("url", ""))
        if request.get("method") != "GET" or response.get("status") != 200:
            continue
        if provider == Provider.YES:
            if url.hostname != "www.yes.co.il" or not url.path.startswith("/content/"):
                continue
            text = _body(entry)
            if "__NUXT_DATA__" not in text:
                continue
            parse_yes_response(text, _capture_date(entry), into=result)
        else:
            if (
                url.hostname != "u.partner.co.il"
                or url.path.rstrip("/") != "/umbraco/api/CmsApi/GetPageContentbyNode"
                or parse_qs(url.query).get("nodeAlias") != ["n/tv-content"]
            ):
                continue
            parse_partner_response(_body(entry), _capture_date(entry), into=result)
        result.matched_responses += 1
        if entry.get("startedDateTime"):
            result.captured_at.add(entry["startedDateTime"])
    if not result.entries:
        raise ValueError(f"no {provider.value} catalog records found in {source.name}")
    return result
