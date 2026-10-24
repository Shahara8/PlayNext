"""Provider response parsers shared by live HTTP fetching and offline HAR imports."""

from collections import Counter
from dataclasses import dataclass, field, replace
from datetime import date
from html import unescape
from html.parser import HTMLParser
import json
import re
from typing import Any, Iterator

from .models import CatalogEntry, ContentType, Provider
from .names import base_title, supplied_english_name


class _NuxtScripts(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.payloads: list[str] = []
        self._chunks: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script" and dict(attrs).get("id") == "__NUXT_DATA__":
            self._chunks = []

    def handle_data(self, data: str) -> None:
        if self._chunks is not None:
            self._chunks.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._chunks is not None:
            self.payloads.append("".join(self._chunks))
            self._chunks = None


class _NuxtPool:
    """Read references in Nuxt's flattened JSON without evaluating JavaScript."""

    def __init__(self, values: list[Any]) -> None:
        self.values = values

    def value(self, index: int | None) -> Any:
        wrappers = {"Ref", "ShallowRef", "Reactive", "ShallowReactive"}
        seen = set()
        while type(index) is int and index >= 0:
            if index in seen or index >= len(self.values):
                raise ValueError("invalid or cyclic Nuxt reference")
            seen.add(index)
            value = self.values[index]
            if (
                isinstance(value, list) and len(value) == 2
                and isinstance(value[0], str) and value[0] in wrappers
            ):
                index = value[1]
                continue
            return value
        return None


def _walk(value: Any) -> Iterator[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def _title(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("catalog item has no display title")
    return " ".join(unescape(value).split())


def _seasons(title: str) -> tuple[int, ...] | None:
    """Only numbered labels; 'season 5' never implies seasons 1 through 5."""
    values: set[int] = set()
    for match in re.finditer(
        r"\bעונ(?:ה|ות)\s+([0-9]{1,3})(?:\s*[-–—־]\s*([0-9]{1,3}))?(?![0-9])",
        title,
    ):
        start = int(match[1])
        end = int(match[2]) if match[2] is not None else start
        if end < start:
            return None
        values.update(range(start, end + 1))
    return tuple(sorted(values)) or None


@dataclass
class ParsedCatalog:
    provider: Provider
    entries: list[CatalogEntry] = field(default_factory=list)
    raw_records: int = 0
    duplicates_removed: int = 0
    _seen: dict[tuple[Any, ...], int] = field(default_factory=dict, repr=False)

    def add(self, entry: CatalogEntry, source_id: Any) -> None:
        self.raw_records += 1
        # Preserve distinct native IDs and variants, while combining repeated
        # observations of the same source record.
        data = entry.to_dict()
        data.pop("last_verified")
        record = json.dumps(data, ensure_ascii=False, sort_keys=True)
        key = (source_id, record)
        if key in self._seen:
            self.duplicates_removed += 1
            position = self._seen[key]
            previous = self.entries[position]
            if entry.last_verified is not None and (
                previous.last_verified is None or entry.last_verified > previous.last_verified
            ):
                self.entries[position] = replace(previous, last_verified=entry.last_verified)
            return
        self._seen[key] = len(self.entries)
        self.entries.append(entry)

    def summary(self) -> dict[str, Any]:
        null_counts = Counter(
            key for entry in self.entries for key, value in entry.to_dict().items()
            if value is None
        )
        return {
            "raw_records": self.raw_records,
            "duplicates_removed": self.duplicates_removed,
            "exported_records": len(self.entries),
            "records_by_type": dict(Counter(
                entry.type.value if entry.type else "unknown" for entry in self.entries
            )),
            "null_counts": dict(sorted(null_counts.items())),
        }


def parse_yes_response(
    html: str, observed_on: date | None, *, into: ParsedCatalog | None = None,
) -> ParsedCatalog:
    result = into if into is not None else ParsedCatalog(Provider.YES)
    parser = _NuxtScripts()
    parser.feed(html)
    for payload in parser.payloads:
        values = json.loads(payload)
        if not isinstance(values, list):
            raise ValueError("expected a flattened Nuxt JSON array")
        pool = _NuxtPool(values)
        for node in values:
            if not isinstance(node, dict) or "contentType" not in node:
                continue
            kind = pool.value(node["contentType"])
            if kind not in ("movie", "tvShow"):
                continue
            properties = pool.value(node.get("properties"))
            if not isinstance(properties, dict):
                continue
            title = _title(pool.value(properties.get("title")) or pool.value(node.get("name")))
            year = pool.value(properties.get("yearOfProduction"))
            if year is not None and (type(year) is not int or year <= 0):
                raise ValueError(f"invalid production year for {title}")
            native_id = pool.value(properties.get("movieId" if kind == "movie" else "showId"))
            source_id = (kind, native_id or pool.value(node.get("id")) or title)
            result.add(CatalogEntry(
                provider=Provider.YES, region="IL", title=title,
                original_title=supplied_english_name(pool.value(properties.get("umbracoUrlName"))),
                type=ContentType.MOVIE if kind == "movie" else ContentType.TV_SERIES,
                release_year=year, last_verified=observed_on,
            ), source_id)
    return result


def parse_partner_response(
    text: str, observed_on: date | None, *, into: ParsedCatalog | None = None,
) -> ParsedCatalog:
    result = into if into is not None else ParsedCatalog(Provider.PARTNER)
    data = json.loads(text)
    for node in _walk(data):
        if node.get("nodeTypeAlias") != "customMarketingPageRootPremiumPackageItem":
            continue
        properties = node.get("properties", {})
        title = _title(properties.get("title") or node.get("name"))
        categories = properties.get("categories") or []
        if isinstance(categories, str):
            categories = json.loads(categories)
        if not isinstance(categories, list):
            raise ValueError(f"invalid categories for {title}")
        labels = {category.get("name") for category in categories if isinstance(category, dict)}
        is_movie = "סרטים" in labels
        is_series = "סדרות" in labels or bool(re.search(r"\bעונ(?:ה|ות)\b", title))
        kind = None
        if is_movie and not is_series:
            kind = ContentType.MOVIE
        elif is_series and not is_movie:
            kind = ContentType.TV_SERIES
        result.add(CatalogEntry(
            provider=Provider.PARTNER, region="IL", title=title, type=kind,
            original_title=supplied_english_name(base_title(title)),
            seasons_available=_seasons(title), last_verified=observed_on,
        ), node.get("id") or title)
    return result
