"""Registered provider collectors and placeholders for future sources."""

from .base import ProviderAdapter
from .freetv import FreeTVAdapter
from .partner import PartnerAdapter
from .yes import YesAdapter


def get_adapters() -> dict[str, ProviderAdapter]:
    return {
        "yes": YesAdapter(),
        "partner": PartnerAdapter(),
        "freetv": FreeTVAdapter(),
    }
