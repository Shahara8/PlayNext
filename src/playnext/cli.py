import argparse
from pathlib import Path
import sys

from .jsonl import read_catalog, update_catalog
from .har import extract_har
from .http import FetchError
from .models import Provider
from .providers import get_adapters
from .providers.base import ProviderNotImplementedError


def main(argv: list[str] | None = None) -> int:
    adapters = get_adapters()
    parser = argparse.ArgumentParser(description="Fetch provider catalogs and export JSON Lines")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("providers", help="List provider fetchers and their status")
    validate = commands.add_parser("validate", help="Validate a local JSONL file")
    validate.add_argument("path", type=Path)
    validate.add_argument(
        "--allow-unmatched", action="store_true",
        help="Inspect staging records with missing IMDb IDs; not a delivery check",
    )
    validate.add_argument(
        "--allow-incomplete", action="store_true",
        help="Allow null IMDb IDs, types and verification dates in offline extracts",
    )
    extract = commands.add_parser("extract-har", help="Extract saved HAR responses offline")
    extract.add_argument("--provider", choices=("yes", "partner"), required=True)
    extract.add_argument("--input", type=Path, required=True)
    extract.add_argument("--output", type=Path, default=Path("data/catalog.jsonl"))
    fetch = commands.add_parser("fetch", help="Fetch current provider listings over HTTP")
    fetch.add_argument("--provider", choices=(*adapters, "all"), default="all")
    fetch.add_argument("--output-dir", type=Path, default=Path("data"))
    args = parser.parse_args(argv)

    if args.command == "providers":
        for slug, adapter in adapters.items():
            status = "HTTP fetcher ready" if adapter.supports_fetch else "not implemented"
            print(f"{slug:8} {adapter.provider.value:12} {status}")
        return 0
    try:
        if args.command == "extract-har":
            provider = {"yes": Provider.YES, "partner": Provider.PARTNER}[args.provider]
            if args.input.resolve() == args.output.resolve():
                raise ValueError("input HAR and output JSONL must be different files")
            result = extract_har(args.input, provider)
            count = update_catalog(args.output, result.entries, providers=[provider])
            print(f"Imported {len(result.entries)} {provider.value} records; "
                  f"final catalog {args.output} contains {count} records.")
            print(f"Removed {result.duplicates_removed} repeated source records.")
            return 0
        if args.command == "fetch":
            selected = (
                [slug for slug, adapter in adapters.items() if adapter.supports_fetch]
                if args.provider == "all" else [args.provider]
            )
            failures = 0
            snapshots = []
            for slug in selected:
                try:
                    snapshot = adapters[slug].fetch()
                    snapshots.append(snapshot)
                    print(f"Fetched {len(snapshot.entries)} {snapshot.provider.value} records; "
                          f"last_verified={snapshot.fetched_at.date() if snapshot.fetched_at else 'unknown'}.")
                except (OSError, ValueError, FetchError, ProviderNotImplementedError) as exc:
                    failures += 1
                    print(f"Error fetching {slug}: {exc}", file=sys.stderr)
            if failures:
                print("Final catalog was not updated because a provider failed.", file=sys.stderr)
                return 1
            output = args.output_dir / "catalog.jsonl"
            count = update_catalog(
                output,
                (entry for snapshot in snapshots for entry in snapshot.entries),
                providers=[snapshot.provider for snapshot in snapshots],
            )
            print(f"Updated final catalog {output}: {count} records.")
            return 0
        count = missing_imdb = missing_type = missing_verified = 0
        for entry in read_catalog(args.path):
            count += 1
            missing_imdb += entry.imdb_id is None
            missing_type += entry.type is None
            missing_verified += entry.last_verified is None
        print(f"Checked {count} records; {missing_imdb} without IMDb IDs; "
              f"{missing_type} without type; {missing_verified} without last_verified.")
        if args.allow_incomplete:
            return 0
        if missing_imdb and not args.allow_unmatched:
            print("IMDb IDs are required for delivery; incomplete records need review.", file=sys.stderr)
            return 1
        if missing_type or missing_verified:
            print("type and last_verified are required for delivery.", file=sys.stderr)
            return 1
        return 0
    except (OSError, ValueError, ProviderNotImplementedError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
