from contextlib import redirect_stderr, redirect_stdout
from dataclasses import replace
from datetime import date
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest

from playnext.cli import main
from playnext.jsonl import read_catalog, update_catalog, write_catalog
from playnext.models import CatalogEntry, ContentType, Provider
from playnext.providers import get_adapters
from playnext.providers.base import ProviderNotImplementedError


def example_entry() -> CatalogEntry:
    # Synthetic test values, not a claim about a real title's availability.
    return CatalogEntry(
        provider=Provider.YES, region="IL", title="סדרת בדיקה",
        type=ContentType.TV_SERIES, imdb_id="tt1234567",
        last_verified=date(2026, 10, 24), seasons_available=(1, 2),
    )


class CatalogTests(unittest.TestCase):
    def test_round_trip_preserves_hebrew_dates_seasons_and_unknowns(self):
        entry = example_entry()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "yes.jsonl"
            self.assertEqual(write_catalog(path, [entry]), 1)
            self.assertIn("סדרת בדיקה", path.read_text(encoding="utf-8"))
            self.assertEqual(list(read_catalog(path)), [entry])
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(data["last_verified"], "2026-10-24")
            self.assertEqual(data["seasons_available"], [1, 2])
            self.assertIsNone(data["added_date"])
            self.assertIsNone(data["removed_date"])

    def test_invalid_contract_values_are_rejected(self):
        invalid_values = {
            "provider": "yes", "region": "Israel", "title": " ",
            "type": "episode", "imdb_id": "1234567", "tmdb_id": True,
            "last_verified": "20261024", "seasons_available": [1, 1],
            "availability_type": "paid", "watch_url": "not-a-url",
        }
        for field, value in invalid_values.items():
            with self.subTest(field=field):
                data = example_entry().to_dict()
                data[field] = value
                with self.assertRaises(ValueError):
                    CatalogEntry.from_dict(data)

    def test_required_fields_cannot_be_omitted(self):
        for field in ("provider", "region", "title", "type", "last_verified"):
            with self.subTest(field=field):
                data = example_entry().to_dict()
                del data[field]
                with self.assertRaises(ValueError):
                    CatalogEntry.from_dict(data)

    def test_bad_json_includes_file_and_line_number(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.jsonl"
            path.write_text(json.dumps(example_entry().to_dict()) + "\n{broken\n", encoding="utf-8")
            with self.assertRaises(ValueError) as error:
                list(read_catalog(path))
            self.assertIn(f"{path}:2:", str(error.exception))

    def test_failed_collection_preserves_previous_output(self):
        def interrupted_collection():
            yield example_entry()
            raise RuntimeError("simulated incomplete provider response")

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "yes.jsonl"
            path.write_text("previous catalog\n", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                write_catalog(path, interrupted_collection())
            self.assertEqual(path.read_text(encoding="utf-8"), "previous catalog\n")
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_delivery_rejects_missing_imdb_but_staging_can_keep_it(self):
        entry = replace(example_entry(), imdb_id=None)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "yes.jsonl"
            with self.assertRaisesRegex(ValueError, "IMDb ID required"):
                write_catalog(path, [entry])
            self.assertFalse(path.exists())
            write_catalog(path, [entry], allow_unmatched=True)
            with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
                self.assertEqual(main(["validate", str(path)]), 1)
                self.assertEqual(main(["validate", str(path), "--allow-unmatched"]), 0)

    def test_provider_registry_and_freetv_placeholder(self):
        adapters = get_adapters()
        self.assertEqual(set(adapters), {"yes", "partner", "freetv"})
        self.assertTrue(adapters["yes"].supports_fetch)
        self.assertTrue(adapters["partner"].supports_fetch)
        self.assertFalse(adapters["freetv"].supports_fetch)
        with self.assertRaises(ProviderNotImplementedError):
            adapters["freetv"].fetch()
        with redirect_stderr(StringIO()):
            self.assertEqual(main(["fetch", "--provider", "freetv"]), 1)

    def test_update_replaces_selected_provider_and_keeps_same_title_at_other_provider(self):
        old = replace(example_entry(), title="Old title")
        partner = replace(example_entry(), provider=Provider.PARTNER)
        fresh = replace(example_entry(), imdb_id=None)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "catalog.jsonl"
            write_catalog(output, [old, partner])
            count = update_catalog(output, [fresh, fresh], providers=[Provider.YES])
            self.assertEqual(count, 2)
            self.assertEqual(list(read_catalog(output)), [partner, fresh])
            self.assertEqual({path.name for path in Path(directory).iterdir()}, {"catalog.jsonl"})

    def test_update_requires_records_for_each_selected_provider(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "catalog.jsonl"
            write_catalog(output, [example_entry()])
            previous = output.read_bytes()
            with self.assertRaises(ValueError):
                update_catalog(output, [example_entry()], providers=[Provider.YES, Provider.PARTNER])
            self.assertEqual(output.read_bytes(), previous)

    def test_merge_infers_english_names_after_all_provider_rows_are_combined(self):
        donor = replace(example_entry(), release_year=2018, original_title="Supplied name")
        target = replace(donor, provider=Provider.PARTNER, original_title=None)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "catalog.jsonl"
            update_catalog(output, [donor, target], providers=[Provider.YES, Provider.PARTNER])
            self.assertEqual(list(read_catalog(output)), [donor, replace(target, original_title="Supplied name")])
            self.assertEqual({path.name for path in Path(directory).iterdir()}, {"catalog.jsonl"})

    def test_merge_error_preserves_final_catalog_and_cleans_temporary_file(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "catalog.jsonl"
            output.write_text("{broken\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                update_catalog(output, [example_entry()], providers=[Provider.YES])
            self.assertEqual(output.read_text(encoding="utf-8"), "{broken\n")
            self.assertEqual({path.name for path in Path(directory).iterdir()}, {"catalog.jsonl"})


if __name__ == "__main__":
    unittest.main()
