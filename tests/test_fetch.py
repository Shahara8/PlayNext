from collections import Counter
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import replace
from datetime import datetime, timezone
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

import requests

from playnext.cli import main
from playnext.http import fetch_text
from playnext.jsonl import read_catalog, write_catalog
from playnext.models import Provider
from playnext.providers.partner import PartnerAdapter
from playnext.providers.yes import YesAdapter
from test_catalog import example_entry
from test_har import EXPECTED_COLUMNS, nuxt_page, partner_node, yes_node


NOW = datetime(2030, 4, 5, 12, 30, tzinfo=timezone.utc)
HAR_DIR = Path(__file__).resolve().parents[1] / "sites har files"


def http_response(text, *, status=200, request=None):
    response = requests.Response()
    response.status_code = status
    response._content = text.encode("utf-8")
    response.url = request.url if request is not None else YesAdapter.source_url
    response.request = request
    return response


class FetchTests(unittest.TestCase):
    def setUp(self):
        # Every HTTP transport in these tests is replaced; forbid accidental
        # connections independently as an extra guard.
        self.addCleanup(patch.stopall)
        patch("socket.create_connection", side_effect=AssertionError("network forbidden")).start()
        patch("curl_cffi.requests.Session", side_effect=AssertionError("browser network forbidden")).start()
        clock = patch("playnext.providers.base.datetime").start()
        clock.now.return_value = NOW

    def test_fetch_command_creates_and_refreshes_snapshot_without_har_files(self):
        first = nuxt_page([yes_node(1, "סרט קודם")])
        updated = nuxt_page([yes_node(1, "סרט קודם"), yes_node(2, "סרט חדש")])
        with tempfile.TemporaryDirectory() as directory:
            args = ["fetch", "--provider", "yes", "--output-dir", directory]
            with patch("requests.Session.send", return_value=http_response(first)), redirect_stdout(StringIO()):
                self.assertEqual(main(args), 0)
            with patch("requests.Session.send", return_value=http_response(updated)), redirect_stdout(StringIO()):
                self.assertEqual(main(args), 0)
            output = Path(directory) / "catalog.jsonl"
            rows = list(read_catalog(output))
            self.assertEqual([row.title for row in rows], ["סרט קודם", "סרט חדש"])
            self.assertTrue(all(row.last_verified == NOW.date() for row in rows))
            self.assertEqual({path.name for path in Path(directory).iterdir()}, {"catalog.jsonl"})

    def test_single_provider_refresh_preserves_other_provider_rows(self):
        partner = replace(example_entry(), provider=Provider.PARTNER)
        html = nuxt_page([yes_node(1, "סרט חדש")])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "catalog.jsonl"
            write_catalog(output, [example_entry(), partner])
            with patch("requests.Session.send", return_value=http_response(html)), redirect_stdout(StringIO()):
                self.assertEqual(main(["fetch", "--provider", "yes", "--output-dir", directory]), 0)
            rows = list(read_catalog(output))
            self.assertEqual(len(rows), 2)
            self.assertIn(partner, rows)
            yes_rows = [row for row in rows if row.provider == Provider.YES]
            self.assertEqual([row.title for row in yes_rows], ["סרט חדש"])
            self.assertEqual(yes_rows[0].last_verified, NOW.date())
            self.assertEqual({path.name for path in Path(directory).iterdir()}, {"catalog.jsonl"})

    def test_http_failures_preserve_existing_final_catalog(self):
        for failure in (requests.Timeout("timed out"), http_response("unavailable", status=503)):
            with self.subTest(failure=type(failure).__name__), tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "catalog.jsonl"
                output.write_text("previous data\n", encoding="utf-8")
                options = {"side_effect": failure} if isinstance(failure, Exception) else {"return_value": failure}
                with patch("requests.Session.send", **options), redirect_stderr(StringIO()):
                    self.assertEqual(main(["fetch", "--provider", "yes", "--output-dir", directory]), 1)
                self.assertEqual(output.read_text(encoding="utf-8"), "previous data\n")
                self.assertEqual({path.name for path in Path(directory).iterdir()}, {"catalog.jsonl"})

    def test_unrecognized_or_malformed_success_responses_preserve_previous_file(self):
        for provider, text in (("yes", "<html>Please sign in</html>"), ("partner", "{}"), ("partner", "{broken")):
            with self.subTest(provider=provider, text=text), tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "catalog.jsonl"
                output.write_text("previous data\n", encoding="utf-8")
                with patch("requests.Session.send", return_value=http_response(text)), redirect_stderr(StringIO()):
                    self.assertEqual(main(["fetch", "--provider", provider, "--output-dir", directory]), 1)
                self.assertEqual(output.read_text(encoding="utf-8"), "previous data\n")

    def test_all_providers_continues_after_failure_and_returns_nonzero(self):
        def send(request, **kwargs):
            if urlsplit(request.url).hostname == "www.yes.co.il":
                raise requests.Timeout("simulated failure")
            return http_response(json.dumps([partner_node(1, "סרט בדיקה", "סרטים")]), request=request)

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "catalog.jsonl"
            output.write_text("previous final catalog\n", encoding="utf-8")
            with patch("requests.Session.send", side_effect=send) as transport, redirect_stdout(StringIO()), redirect_stderr(StringIO()):
                self.assertEqual(main(["fetch", "--output-dir", directory]), 1)
            self.assertEqual(transport.call_count, 2)
            self.assertEqual(output.read_text(encoding="utf-8"), "previous final catalog\n")
            self.assertEqual({path.name for path in Path(directory).iterdir()}, {"catalog.jsonl"})

    def test_http_transport_configures_timeouts_retries_and_utf8(self):
        with patch("playnext.http.requests.Session") as factory:
            session = factory.return_value.__enter__.return_value
            session.get.return_value = http_response("עברית")
            self.assertEqual(fetch_text(YesAdapter.source_url, headers=YesAdapter.headers), "עברית")
            session.get.assert_called_once_with(YesAdapter.source_url, headers=YesAdapter.headers, timeout=(10, 30))
            retry = session.mount.call_args.args[1].max_retries
            self.assertEqual(retry.total, 3)
            self.assertEqual(retry.allowed_methods, frozenset({"GET"}))
            self.assertIn(429, retry.status_forcelist)
            self.assertIn(503, retry.status_forcelist)

    def test_yes_403_uses_browser_transport_and_updates_only_final_catalog(self):
        html = nuxt_page([yes_node(1, "סרט בדיקה")])
        browser_response = Mock()
        browser_response.content = html.encode("utf-8")
        with tempfile.TemporaryDirectory() as directory:
            with patch("requests.Session.send", return_value=http_response("Forbidden", status=403)), \
                    patch("curl_cffi.requests.Session") as browser_factory, redirect_stdout(StringIO()):
                session = browser_factory.return_value.__enter__.return_value
                session.get.return_value = browser_response
                self.assertEqual(main(["fetch", "--provider", "yes", "--output-dir", directory]), 0)
                browser_factory.assert_called_once_with(impersonate="chrome")
                args, kwargs = session.get.call_args
                self.assertEqual(args, (YesAdapter.source_url,))
                self.assertEqual(kwargs["timeout"], (10, 30))
                self.assertNotIn("User-Agent", kwargs["headers"])
                self.assertEqual(kwargs["headers"]["Sec-Fetch-Mode"], "navigate")
                browser_response.raise_for_status.assert_called_once()
            rows = list(read_catalog(Path(directory) / "catalog.jsonl"))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].last_verified, NOW.date())
            self.assertEqual({path.name for path in Path(directory).iterdir()}, {"catalog.jsonl"})

    def test_failed_browser_transport_preserves_final_catalog(self):
        from curl_cffi.requests import RequestsError

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "catalog.jsonl"
            output.write_text("previous final data\n", encoding="utf-8")
            with patch("requests.Session.send", return_value=http_response("Forbidden", status=403)), \
                    patch("curl_cffi.requests.Session") as browser_factory, redirect_stderr(StringIO()):
                session = browser_factory.return_value.__enter__.return_value
                session.get.side_effect = RequestsError("still forbidden")
                self.assertEqual(main(["fetch", "--provider", "yes", "--output-dir", directory]), 1)
            self.assertEqual(output.read_text(encoding="utf-8"), "previous final data\n")
            self.assertEqual({path.name for path in Path(directory).iterdir()}, {"catalog.jsonl"})

    def test_partner_403_does_not_enable_yes_browser_fallback(self):
        with patch("requests.Session.send", return_value=http_response("Forbidden", status=403)), \
                patch("playnext.http._fetch_browser_text") as fallback, redirect_stderr(StringIO()):
            self.assertEqual(main(["fetch", "--provider", "partner"]), 1)
            fallback.assert_not_called()

    @unittest.skipUnless(
        (HAR_DIR / "www.yes.co.il.har").exists() and (HAR_DIR / "www.partner.co.il.har").exists(),
        "Recorded provider responses are not available",
    )
    def test_full_http_flow_against_recorded_payloads_without_live_requests(self):
        payloads = {}
        for filename, hostname, path in (
            ("www.yes.co.il.har", "www.yes.co.il", "/content/main/"),
            ("www.partner.co.il.har", "u.partner.co.il", "/umbraco/api/CmsApi/GetPageContentbyNode/"),
        ):
            document = json.loads((HAR_DIR / filename).read_text(encoding="utf-8-sig"))
            for entry in document["log"]["entries"]:
                url = urlsplit(entry["request"]["url"])
                if url.hostname == hostname and url.path == path:
                    payloads[hostname] = entry["response"]["content"]["text"]
                    break

        def send(request, **kwargs):
            url = urlsplit(request.url)
            self.assertEqual(request.method, "GET")
            self.assertEqual(kwargs["timeout"], (10, 30))
            if url.hostname == "u.partner.co.il":
                self.assertEqual(parse_qs(url.query)["nodeAlias"], ["n/tv-content"])
                self.assertEqual(request.headers["Origin"], "https://www.partner.co.il")
            return http_response(payloads[url.hostname], request=request)

        with tempfile.TemporaryDirectory() as directory:
            with patch("requests.Session.send", side_effect=send) as transport, redirect_stdout(StringIO()):
                self.assertEqual(main(["fetch", "--output-dir", directory]), 0)
            self.assertEqual(transport.call_count, 2)
            output = Path(directory) / "catalog.jsonl"
            rows = list(read_catalog(output))
            self.assertEqual(len(rows), 417)
            self.assertEqual(Counter(row.provider.value for row in rows), {"YES": 316, "Partner TV": 101})
            self.assertTrue(all(row.original_title for row in rows if row.provider == Provider.YES))
            partner_names = [row.original_title for row in rows if row.provider == Provider.PARTNER]
            self.assertEqual({name for name in partner_names if name is not None}, {"CIA", "Hacks"})
            self.assertEqual(partner_names.count(None), 99)
            self.assertTrue(all(set(row.to_dict()) == EXPECTED_COLUMNS for row in rows))
            self.assertTrue(all(row.last_verified == NOW.date() for row in rows))
            self.assertEqual({path.name for path in Path(directory).iterdir()}, {"catalog.jsonl"})


if __name__ == "__main__":
    unittest.main()
