"""The common, provider-independent JSONL record format."""

from dataclasses import asdict, dataclass, fields
from datetime import date
from enum import Enum
import re
from typing import Any
from urllib.parse import urlparse


class Provider(str, Enum):
    YES = "YES"
    PARTNER = "Partner TV"
    FREETV = "FreeTV"


class ContentType(str, Enum):
    MOVIE = "movie"
    TV_SERIES = "tv_series"


class AvailabilityType(str, Enum):
    SUBSCRIPTION = "subscription"
    RENT = "rent"
    BUY = "buy"
    FREE = "free"
    ADS = "ads"


@dataclass(frozen=True, slots=True)
class CatalogEntry:
    provider: Provider
    region: str
    title: str
    type: ContentType | None
    last_verified: date | None
    imdb_id: str | None = None
    original_title: str | None = None
    release_year: int | None = None
    tmdb_id: int | None = None
    availability_type: AvailabilityType | None = None
    watch_url: str | None = None
    seasons_available: tuple[int, ...] | None = None
    added_date: date | None = None
    removed_date: date | None = None

    def __post_init__(self) -> None:
        for name, expected in (("provider", Provider), ("type", ContentType)):
            if name == "type" and self.type is None:
                continue
            if not isinstance(getattr(self, name), expected):
                raise ValueError(f"{name} must be a {expected.__name__}")
        if self.availability_type is not None and not isinstance(
            self.availability_type, AvailabilityType
        ):
            raise ValueError("invalid availability_type")
        if not isinstance(self.region, str) or not re.fullmatch(r"[A-Z]{2}", self.region):
            raise ValueError("region must be a two-letter uppercase country code")
        for name in ("title", "original_title"):
            value = getattr(self, name)
            if value is None and name == "original_title":
                continue
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{name} must be a nonempty string")
        for name in ("last_verified", "added_date", "removed_date"):
            value = getattr(self, name)
            if value is None:
                continue
            if type(value) is not date:
                raise ValueError(f"{name} must be a date")
        if self.imdb_id is not None and (
            not isinstance(self.imdb_id, str)
            or not re.fullmatch(r"tt[0-9]{7,}", self.imdb_id)
        ):
            raise ValueError("imdb_id must look like tt1234567, or be null")
        for name in ("release_year", "tmdb_id"):
            value = getattr(self, name)
            if value is not None and (type(value) is not int or value <= 0):
                raise ValueError(f"{name} must be a positive integer, or null")
        if self.watch_url is not None:
            if not isinstance(self.watch_url, str):
                raise ValueError("watch_url must be an HTTP(S) URL, or null")
            parsed = urlparse(self.watch_url)
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                raise ValueError("watch_url must be an HTTP(S) URL, or null")
        if self.seasons_available is not None:
            if not isinstance(self.seasons_available, tuple) or any(
                type(season) is not int or season < 0 for season in self.seasons_available
            ):
                raise ValueError("seasons_available must contain nonnegative integers")
            if len(set(self.seasons_available)) != len(self.seasons_available):
                raise ValueError("seasons_available must not contain duplicates")

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        for name, value in result.items():
            if isinstance(value, Enum):
                result[name] = value.value
            elif isinstance(value, date):
                result[name] = value.isoformat()
            elif isinstance(value, tuple):
                result[name] = list(value)
        return result

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "CatalogEntry":
        if not isinstance(value, dict):
            raise ValueError("each record must be a JSON object")
        unknown = value.keys() - {field.name for field in fields(cls)}
        if unknown:
            raise ValueError(f"unknown fields: {', '.join(sorted(unknown))}")
        data = dict(value)
        try:
            data["provider"] = Provider(data["provider"])
            data["type"] = ContentType(data["type"]) if data["type"] is not None else None
            if data.get("availability_type") is not None:
                data["availability_type"] = AvailabilityType(data["availability_type"])
            for name in ("last_verified", "added_date", "removed_date"):
                if data.get(name) is not None:
                    raw_date = data[name]
                    if not isinstance(raw_date, str) or not re.fullmatch(
                        r"[0-9]{4}-[0-9]{2}-[0-9]{2}", raw_date
                    ):
                        raise ValueError(f"{name} must use YYYY-MM-DD")
                    data[name] = date.fromisoformat(raw_date)
            if data.get("seasons_available") is not None:
                if not isinstance(data["seasons_available"], list):
                    raise ValueError("seasons_available must be an array, or null")
                data["seasons_available"] = tuple(data["seasons_available"])
            return cls(**data)
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"invalid catalog record: {exc}") from exc
