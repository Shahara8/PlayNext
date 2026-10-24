"""Offline catalog reading and atomic UTF-8 JSON Lines export."""

from collections.abc import Collection, Iterable, Iterator
import json
import os
from pathlib import Path
import tempfile

from .models import CatalogEntry, Provider
from .names import infer_original_titles


def read_catalog(path: Path) -> Iterator[CatalogEntry]:
    with path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            try:
                yield CatalogEntry.from_dict(json.loads(line))
            except ValueError as exc:
                raise ValueError(f"{path}:{line_number}: {exc}") from exc


def write_catalog(
    path: Path, entries: Iterable[CatalogEntry], *, allow_unmatched: bool = False,
    allow_incomplete: bool = False,
) -> int:
    """Keep the existing catalog intact if serialization or collection fails."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    count = 0
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="\n", dir=path.parent,
            prefix=f".{path.name}.", suffix=".tmp", delete=False,
        ) as stream:
            temporary_path = Path(stream.name)
            for entry in entries:
                if entry.imdb_id is None and not (allow_unmatched or allow_incomplete):
                    raise ValueError(f"IMDb ID required for delivery: {entry.title}")
                if not allow_incomplete and (entry.type is None or entry.last_verified is None):
                    raise ValueError(f"type and last_verified required for delivery: {entry.title}")
                stream.write(json.dumps(entry.to_dict(), ensure_ascii=False) + "\n")
                count += 1
        os.replace(temporary_path, path)
        return count
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def update_catalog(
    path: Path, entries: Iterable[CatalogEntry], *, providers: Collection[Provider],
) -> int:
    """Replace fetched providers in one final file, retaining other providers.

    All selected providers must return records before the existing file can be
    replaced. Values absent from the sources remain null, as requested.
    """
    replacements = set(providers)
    fresh = tuple(entries)
    if not replacements or {entry.provider for entry in fresh} != replacements:
        raise ValueError("each selected provider must return catalog records")

    def combined() -> Iterator[CatalogEntry]:
        if path.exists():
            yield from (entry for entry in read_catalog(path) if entry.provider not in replacements)
        yield from fresh

    def resolved() -> Iterator[CatalogEntry]:
        seen: set[str] = set()
        for entry in infer_original_titles(combined()):
            key = json.dumps(entry.to_dict(), ensure_ascii=False, sort_keys=True)
            if key not in seen:
                seen.add(key)
                yield entry

    return write_catalog(path, resolved(), allow_incomplete=True)
