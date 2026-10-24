from datetime import date

from ..models import Provider
from ..parsers import ParsedCatalog, parse_yes_response
from .base import RequestsProviderAdapter


class YesAdapter(RequestsProviderAdapter):
    provider = Provider.YES
    browser_fallback = True
    source_url = "https://www.yes.co.il/content/main/"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://www.yes.co.il/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }

    def parse(self, text: str, observed_on: date) -> ParsedCatalog:
        return parse_yes_response(text, observed_on)
