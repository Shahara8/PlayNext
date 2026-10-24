import base64
from contextlib import redirect_stdout
from dataclasses import replace
from datetime import date
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from playnext.cli import main
from playnext.har import extract_har
from playnext.parsers import _NuxtPool, parse_yes_response
from playnext.jsonl import read_catalog, write_catalog
from playnext.models import Provider
from test_catalog import example_entry


EXPECTED_COLUMNS = {
    "provider", "region", "title", "original_title", "type", "release_year",
    "imdb_id", "tmdb_id", "availability_type", "watch_url", "seasons_available",
    "added_date", "removed_date", "last_verified",
}


def response(url, text, *, encoded=False, status=200):
    content = {"text": text}
    if encoded:
        content = {"text": base64.b64encode(text.encode()).decode(), "encoding": "base64"}
    return {
        "startedDateTime": "2026-10-24T10:00:00Z",
        "request": {"method": "GET", "url": url},
        "response": {"status": status, "content": content},
    }


def nuxt_page(nodes):
    pool = []

    def encode(value):
        index = len(pool)
        pool.append(None)
        if isinstance(value, dict):
            pool[index] = {key: encode(child) for key, child in value.items()}
        elif isinstance(value, list):
            pool[index] = [encode(child) for child in value]
        else:
            pool[index] = value
        return index

    encode({"records": nodes})
    return '<script type="application/json" id="__NUXT_DATA__">' + json.dumps(pool) + '</script>'


def yes_node(native_id, title):
    return {
        "id": "cms-test", "contentType": "movie", "name": title,
        "properties": {"title": title, "yearOfProduction": 2025, "movieId": native_id},
    }


def partner_node(native_id, title, category):
    return {
        "id": native_id, "nodeTypeAlias": "customMarketingPageRootPremiumPackageItem",
        "properties": {
            "title": title, "categories": json.dumps([{"name": category}]),
            "description": "not part of the delivery", "image": "/not-exported.jpg",
        },
    }


class HarTests(unittest.TestCase):
    def save(self, directory, entries):
        path = Path(directory) / "capture.har"
        path.write_text(json.dumps({"log": {"entries": entries}}), encoding="utf-8")
        return path

    def test_yes_base64_deduplicates_repeats_and_preserves_dubbed_variants(self):
        movie = yes_node(123, "סרט בדיקה")
        dubbed = yes_node(124, "סרט בדיקה (מדובב)")
        html = nuxt_page([movie, movie, dubbed])
        with tempfile.TemporaryDirectory() as directory:
            source = self.save(directory, [response("https://www.yes.co.il/content/main/", html, encoded=True)])
            with patch("socket.create_connection", side_effect=AssertionError("network forbidden")):
                result = extract_har(source, Provider.YES)
            self.assertEqual(result.raw_records, 3)
            self.assertEqual(result.duplicates_removed, 1)
            self.assertEqual(len(result.entries), 2)
            for entry in result.entries:
                self.assertEqual(set(entry.to_dict()), EXPECTED_COLUMNS)
                self.assertEqual(entry.release_year, 2025)
                self.assertIsNone(entry.imdb_id)
                self.assertIsNone(entry.watch_url)
                self.assertEqual(entry.last_verified, date(2026, 10, 24))

    def test_yes_includes_supplied_english_label_and_preserves_hebrew_title(self):
        node = {
            "id": "example", "contentType": "tvShow", "name": "ילוסטון",
            "properties": {"title": "ילוסטון", "showId": 1, "umbracoUrlName": " Yellowstone "},
        }
        rows = parse_yes_response(nuxt_page([node]), date(2026, 10, 24)).entries
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].title, "ילוסטון")
        self.assertEqual(rows[0].original_title, "Yellowstone")
        self.assertEqual(set(rows[0].to_dict()), EXPECTED_COLUMNS)

    def test_yes_does_not_invent_missing_or_hebrew_only_english_labels(self):
        for label in (None, "", 123, "כותרת בעברית", "סדרה BBC", "中文 BBC", "&#x05D9;&#x05DC;&#x05D5;"):
            with self.subTest(label=label):
                node = yes_node(1, "סרט בדיקה")
                node["properties"]["umbracoUrlName"] = label
                rows = parse_yes_response(nuxt_page([node]), date(2026, 10, 24)).entries
                self.assertIsNone(rows[0].original_title)

    def test_partner_types_and_only_explicit_numbered_seasons(self):
        nodes = [
            partner_node(1, "סדרה | עונה 5 ", "ילדים"),
            partner_node(2, "סדרה אחרת | עונות 1–3", "סדרות"),
            partner_node(3, "שם לא מסווג", "הכי חדשים"),
            partner_node(4, "סרט לדוגמה", "סרטים"),
            partner_node(5, "סדרה | עונה חדשה", "ילדים"),
            partner_node(6, "סדרה | עונות 5-1", "סדרות"),
        ]
        body = json.dumps({"childrenAsList": nodes + [nodes[0]]})
        with tempfile.TemporaryDirectory() as directory:
            source = self.save(directory, [response(
                "https://u.partner.co.il/umbraco/api/CmsApi/GetPageContentbyNode/?nodeAlias=n/tv-content", body,
            )])
            result = extract_har(source, Provider.PARTNER)
            entries = result.entries
            self.assertEqual(len(entries), 6)
            self.assertEqual(result.duplicates_removed, 1)
            self.assertEqual(entries[0].seasons_available, (5,))
            self.assertEqual(entries[0].type.value, "tv_series")
            self.assertEqual(entries[1].seasons_available, (1, 2, 3))
            self.assertIsNone(entries[2].type)
            self.assertIsNone(entries[2].seasons_available)
            self.assertEqual(entries[3].type.value, "movie")
            self.assertEqual(entries[4].type.value, "tv_series")
            self.assertIsNone(entries[4].seasons_available)
            self.assertIsNone(entries[5].seasons_available)
            self.assertEqual(entries[0].title, "סדרה | עונה 5")
            self.assertTrue(all(entry.last_verified == date(2026, 10, 24) for entry in entries))

    def test_partner_keeps_supplied_english_display_names_without_translation(self):
        nodes = [
            partner_node(1, "Hacks | עונה 5", "סדרות"),
            partner_node(2, "CIA | עונה 2", "סדרות"),
            partner_node(3, "AI אוהב אותך לנצח", "דוקו ופנאי"),
        ]
        with tempfile.TemporaryDirectory() as directory:
            source = self.save(directory, [response(
                "https://u.partner.co.il/umbraco/api/CmsApi/GetPageContentbyNode/?nodeAlias=n/tv-content",
                json.dumps(nodes),
            )])
            rows = extract_har(source, Provider.PARTNER).entries
            self.assertEqual([entry.original_title for entry in rows], ["Hacks", "CIA", None])
            self.assertEqual(rows[0].title, "Hacks | עונה 5")

    def test_verification_uses_capture_date_and_latest_observation_without_duplicates(self):
        html = nuxt_page([yes_node(123, "סרט בדיקה")])
        newer = response("https://www.yes.co.il/content/main/", html)
        newer["startedDateTime"] = "2026-10-25T10:00:00Z"
        older = response("https://www.yes.co.il/content/main/", html)
        missing = response("https://www.yes.co.il/content/main/", html)
        del missing["startedDateTime"]
        with tempfile.TemporaryDirectory() as directory:
            source = self.save(directory, [older, newer, missing, older])
            result = extract_har(source, Provider.YES)
            self.assertEqual(len(result.entries), 1)
            self.assertEqual(result.duplicates_removed, 3)
            self.assertEqual(result.entries[0].last_verified, date(2026, 10, 25))
            source = self.save(directory, [missing])
            self.assertIsNone(extract_har(source, Provider.YES).entries[0].last_verified)

    def test_unrelated_or_failed_responses_are_not_catalog_sources(self):
        html = nuxt_page([yes_node(123, "דוגמה")])
        with tempfile.TemporaryDirectory() as directory:
            source = self.save(directory, [
                response("https://unrelated.invalid/content/main/", html),
                response("https://www.yes.co.il/content/main/", html, status=401),
            ])
            with self.assertRaisesRegex(ValueError, "no YES catalog records"):
                extract_har(source, Provider.YES)

    def test_nuxt_references_preserve_zero_false_null_and_reject_cycles(self):
        pool = _NuxtPool([0, False, None, "movie", ["Ref", 3]])
        self.assertEqual(pool.value(0), 0)
        self.assertIs(pool.value(1), False)
        self.assertIsNone(pool.value(2))
        self.assertIsNone(pool.value(-1))
        self.assertEqual(pool.value(4), "movie")
        with self.assertRaises(ValueError):
            _NuxtPool([["Ref", 0]]).value(0)

    def test_cli_export_round_trip_without_extra_output_files(self):
        html = nuxt_page([yes_node(123, "סרט בדיקה")])
        with tempfile.TemporaryDirectory() as directory:
            source = self.save(directory, [response("https://www.yes.co.il/content/main/", html)])
            output = Path(directory) / "yes.jsonl"
            with redirect_stdout(StringIO()):
                self.assertEqual(main([
                    "extract-har", "--provider", "yes", "--input", str(source), "--output", str(output),
                ]), 0)
                self.assertEqual(main(["validate", str(output), "--allow-incomplete"]), 0)
            self.assertEqual(len(list(read_catalog(output))), 1)
            self.assertEqual({path.name for path in Path(directory).iterdir()}, {"capture.har", "yes.jsonl"})
            report = extract_har(source, Provider.YES).report(source)
            self.assertEqual(report["captured_at"], ["2026-10-24T10:00:00Z"])
            self.assertEqual(report["coverage"], "partial")
            self.assertFalse(report["live_requests_made"])
            self.assertNotIn("last_verified", report["null_counts"])

    def test_nullable_type_and_verification_need_explicit_incomplete_export(self):
        entry = replace(example_entry(), type=None, last_verified=None)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "staging.jsonl"
            with self.assertRaisesRegex(ValueError, "type and last_verified"):
                write_catalog(output, [entry], allow_unmatched=True)
            write_catalog(output, [entry], allow_incomplete=True)
            self.assertEqual(list(read_catalog(output)), [entry])


if __name__ == "__main__":
    unittest.main()
