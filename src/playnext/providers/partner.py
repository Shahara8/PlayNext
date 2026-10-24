from datetime import date

from ..models import Provider
from ..parsers import ParsedCatalog, parse_partner_response
from .base import RequestsProviderAdapter


class PartnerAdapter(RequestsProviderAdapter):
    provider = Provider.PARTNER
    source_url = (
        "https://u.partner.co.il/umbraco/api/CmsApi/GetPageContentbyNode/"
        "?nodeAlias=n/tv-content&subNodeAlias="
    )
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.partner.co.il",
        "Referer": "https://www.partner.co.il/",
    }

    def parse(self, text: str, observed_on: date) -> ParsedCatalog:
        return parse_partner_response(text, observed_on)
