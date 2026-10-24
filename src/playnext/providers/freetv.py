from ..models import Provider
from .base import CatalogSnapshot, ProviderAdapter, ProviderNotImplementedError


class FreeTVAdapter(ProviderAdapter):
    provider = Provider.FREETV

    def fetch(self) -> CatalogSnapshot:
        raise ProviderNotImplementedError("FreeTV source discovery and fetching are not implemented.")
