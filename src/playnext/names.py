"""Reuse provider-supplied English names only when catalog identities agree."""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import replace
from html import unescape
import re
import unicodedata

from .models import CatalogEntry


def supplied_english_name(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    label = " ".join(unescape(value).split())
    letters = [char for char in label if unicodedata.category(char).startswith("L")]
    if not letters or any("LATIN" not in unicodedata.name(char, "") for char in letters):
        return None
    return label


def base_title(title: str) -> str:
    """Remove an explicit season annotation, retaining dubbing/country qualifiers."""
    return re.sub(
        r"\s*\|\s*(?:עונ(?:ה|ות)\s+(?=[0-9]|חדשה\b)|seasons?\s+(?=[0-9]|new\b)).*$",
        "", title, flags=re.IGNORECASE,
    ).strip()


def _title_key(title: str) -> str:
    text = base_title(unicodedata.normalize("NFKC", title)).casefold()
    text = text.translate(str.maketrans({"’": "'", "‘": "'", "׳": "'", "“": '"', "”": '"', "״": '"'}))
    text = re.sub(r"\s*([.:])\s*", r"\1", text)
    return " ".join(text.split())


def _compatible(left: CatalogEntry, right: CatalogEntry) -> bool:
    for field in ("type", "release_year", "imdb_id", "tmdb_id"):
        first, second = getattr(left, field), getattr(right, field)
        if first is not None and second is not None and first != second:
            return False
    return True


def infer_original_titles(entries: Iterable[CatalogEntry]) -> list[CatalogEntry]:
    """Fill null names from another provider, without translation or fuzzy matching.

    A shared IMDb ID or a shared (type, TMDB ID) establishes identity. Otherwise,
    region, normalized title, known content type, and known release year must
    all match. Conflicting IDs, years, types, or source names prevent inference.
    Donors are fixed before matching, so inferred names do not seed more matches.
    """
    rows = list(entries)
    by_imdb: dict[str, set[int]] = defaultdict(set)
    by_tmdb: dict[tuple, set[int]] = defaultdict(set)
    by_title: dict[tuple, set[int]] = defaultdict(set)
    for index, row in enumerate(rows):
        if supplied_english_name(row.original_title) is None:
            continue
        if row.imdb_id:
            by_imdb[row.imdb_id].add(index)
        if row.tmdb_id is not None and row.type is not None:
            by_tmdb[(row.type, row.tmdb_id)].add(index)
        if row.type is not None and row.release_year is not None:
            by_title[(row.region, _title_key(row.title), row.type, row.release_year)].add(index)

    result = []
    for row in rows:
        if row.original_title is not None:
            result.append(row)
            continue
        candidates = set()
        if row.imdb_id:
            candidates.update(by_imdb.get(row.imdb_id, ()))
        if row.tmdb_id is not None and row.type is not None:
            candidates.update(by_tmdb.get((row.type, row.tmdb_id), ()))
        candidates = {index for index in candidates if rows[index].provider != row.provider}
        # Strong ID matches take precedence. Do not fall back to a title match
        # if the ID match instead reveals a contradictory year or type.
        if not candidates and row.type is not None and row.release_year is not None:
            candidates = set(by_title.get(
                (row.region, _title_key(row.title), row.type, row.release_year), (),
            ))
        donors = [
            rows[index] for index in sorted(candidates)
            if rows[index].provider != row.provider and _compatible(row, rows[index])
        ]
        name = None
        if donors:
            names = {unicodedata.normalize("NFKC", donor.original_title).casefold().strip() for donor in donors}
            consistent = all(
                len({getattr(donor, field) for donor in donors if getattr(donor, field) is not None}) <= 1
                for field in ("imdb_id", "tmdb_id", "type", "release_year")
            )
            if consistent and len(names) == 1:
                name = donors[0].original_title
        result.append(replace(row, original_title=name) if name is not None else row)
    return result
