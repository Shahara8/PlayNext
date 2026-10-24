from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any

from ..http import fetch_text
from ..models import CatalogEntry, Provider
from ..parsers import ParsedCatalog


class Coverage(str, Enum):
    PARTIAL = "partial"
    COMPLETE = "complete"


@dataclass(frozen=True, slots=True)
class CatalogSnapshot:
    """Run-level coverage is separate from individual exported title records.

    A partial listing must never be used to infer that missing titles were removed.
    """

    provider: Provider
    entries: tuple[CatalogEntry, ...]
    coverage: Coverage = Coverage.PARTIAL
    fetched_at: datetime | None = None
    source_urls: tuple[str, ...] = ()
    raw_records: int = 0
    duplicates_removed: int = 0

    def report(self) -> dict[str, Any]:
        parsed = ParsedCatalog(
            self.provider, list(self.entries), self.raw_records, self.duplicates_removed,
        )
        return {
            "provider": self.provider.value,
            "coverage": self.coverage.value,
            "live_requests_made": True,
            "fetched_at": self.fetched_at.isoformat() if self.fetched_at else None,
            "source_urls": list(self.source_urls),
            **parsed.summary(),
            "notes": [
                "Fetched the provider website listing; full VOD coverage is unproven.",
                "last_verified is the UTC fetch date.",
                "Missing fields remain null; missing listings do not establish removal dates.",
            ],
        }


class ProviderNotImplementedError(NotImplementedError):
    pass


class ProviderAdapter(ABC):
    provider: Provider
    supports_fetch = False

    @abstractmethod
    def fetch(self) -> CatalogSnapshot:
        """Return a validated catalog snapshot for this provider."""
        raise NotImplementedError


class RequestsProviderAdapter(ProviderAdapter):
    supports_fetch = True
    browser_fallback = False
    source_url: str
    headers: dict[str, str]

    @abstractmethod
    def parse(self, text: str, observed_on: date) -> ParsedCatalog:
        raise NotImplementedError

    def fetch(self) -> CatalogSnapshot:
        text = fetch_text(
            self.source_url, headers=self.headers, browser_fallback=self.browser_fallback,
        )
        fetched_at = datetime.now(timezone.utc)
        parsed = self.parse(text, fetched_at.date())
        if not parsed.entries:
            raise ValueError(
                f"{self.provider.value} returned no recognizable titles; existing output is preserved."
            )
        return CatalogSnapshot(
            provider=self.provider, entries=tuple(parsed.entries),
            fetched_at=fetched_at, source_urls=(self.source_url,),
            raw_records=parsed.raw_records, duplicates_removed=parsed.duplicates_removed,
        )
