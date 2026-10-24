from dataclasses import replace
from datetime import date
import unittest

from playnext.models import CatalogEntry, ContentType, Provider
from playnext.names import infer_original_titles


def row(provider, name=None, **changes):
    values = dict(
        provider=provider, region="IL", title="ילוסטון", type=ContentType.TV_SERIES,
        release_year=2018, original_title=name, last_verified=date(2026, 10, 24),
    )
    values.update(changes)
    return CatalogEntry(**values)


class NameMatchingTests(unittest.TestCase):
    def test_exact_title_type_and_year_reuse_supplied_name_only(self):
        donor = row(Provider.YES, "Yellowstone")
        target = row(Provider.PARTNER, title="ילוסטון | עונות 1-5", seasons_available=(1, 2, 3, 4, 5))
        result = infer_original_titles([target, donor])
        self.assertEqual(result, [replace(target, original_title="Yellowstone"), donor])

    def test_title_alone_or_missing_identity_fields_is_not_enough(self):
        donor = row(Provider.YES, "Yellowstone")
        target = row(Provider.PARTNER)
        for source, missing in (
            (donor, replace(target, release_year=None)),
            (donor, replace(target, type=None)),
            (replace(donor, release_year=None), target),
            (replace(donor, type=None), target),
        ):
            with self.subTest(source=source, target=missing):
                self.assertIsNone(infer_original_titles([source, missing])[1].original_title)

    def test_same_title_remakes_are_separated_by_year(self):
        old = row(Provider.YES, "Original version", type=ContentType.MOVIE, release_year=1960)
        new = row(Provider.FREETV, "Later version", type=ContentType.MOVIE, release_year=1998)
        target = row(Provider.PARTNER, type=ContentType.MOVIE, release_year=1998)
        self.assertEqual(infer_original_titles([old, new, target])[2].original_title, "Later version")

    def test_shared_imdb_can_identify_different_display_titles_without_year(self):
        source = row(Provider.YES, "Yellowstone", imdb_id="tt1234567", release_year=None)
        target = row(Provider.PARTNER, title="שם אחר", imdb_id="tt1234567", release_year=None, type=None)
        self.assertEqual(infer_original_titles([source, target])[1], replace(target, original_title="Yellowstone"))

    def test_known_year_type_or_id_conflicts_block_even_shared_imdb(self):
        donor = row(Provider.YES, "Yellowstone", imdb_id="tt1234567", tmdb_id=1)
        target = row(Provider.PARTNER, imdb_id="tt1234567", tmdb_id=1)
        for changes in ({"release_year": 2020}, {"type": ContentType.MOVIE}, {"tmdb_id": 2}):
            with self.subTest(changes=changes):
                conflicting = replace(target, **changes)
                self.assertIsNone(infer_original_titles([donor, conflicting])[1].original_title)

    def test_tmdb_id_must_be_in_same_known_movie_or_tv_namespace(self):
        donor = row(Provider.YES, "An English movie", type=ContentType.MOVIE, tmdb_id=1, release_year=None)
        for kind in (None, ContentType.TV_SERIES):
            target = row(Provider.PARTNER, tmdb_id=1, type=kind, release_year=None)
            self.assertIsNone(infer_original_titles([donor, target])[1].original_title)
        target = row(Provider.PARTNER, tmdb_id=1, type=ContentType.MOVIE, release_year=None)
        self.assertEqual(infer_original_titles([donor, target])[1].original_title, "An English movie")

    def test_conflicting_english_names_stay_null(self):
        first = row(Provider.YES, "First name", imdb_id="tt1234567")
        second = row(Provider.FREETV, "Different name", imdb_id="tt1234567")
        target = row(Provider.PARTNER)
        self.assertIsNone(infer_original_titles([first, second, target])[2].original_title)

    def test_conflicting_donor_ids_are_ambiguous_even_if_english_names_agree(self):
        first = row(Provider.YES, "Same name", imdb_id="tt1234567")
        second = row(Provider.FREETV, "Same name", imdb_id="tt7654321")
        target = row(Provider.PARTNER)
        self.assertIsNone(infer_original_titles([first, second, target])[2].original_title)

    def test_strong_id_match_takes_precedence_over_weak_name_collision(self):
        identified = row(Provider.YES, "Correct name", imdb_id="tt1234567")
        other = row(Provider.FREETV, "Other name")
        target = row(Provider.PARTNER, imdb_id="tt1234567")
        self.assertEqual(infer_original_titles([identified, other, target])[2].original_title, "Correct name")

    def test_provided_names_are_never_overwritten(self):
        target = row(Provider.PARTNER, "Name supplied by Partner")
        donor = row(Provider.YES, "Another name")
        self.assertEqual(infer_original_titles([target, donor])[0], target)

    def test_same_provider_and_hebrew_only_names_are_not_donors(self):
        target = row(Provider.PARTNER)
        for donor in (row(Provider.PARTNER, "Yellowstone"), row(Provider.YES, "ילוסטון")):
            with self.subTest(donor=donor):
                self.assertIsNone(infer_original_titles([donor, target])[1].original_title)

    def test_inferred_names_do_not_seed_more_matches(self):
        source = row(Provider.YES, "Yellowstone", imdb_id="tt1234567", release_year=None)
        intermediate = row(Provider.PARTNER, imdb_id="tt1234567")
        unsupported = row(Provider.FREETV)
        result = infer_original_titles([source, intermediate, unsupported])
        self.assertEqual(result[1].original_title, "Yellowstone")
        self.assertIsNone(result[2].original_title)

    def test_country_dubbing_qualifiers_and_regions_are_not_discarded(self):
        donor = row(Provider.YES, "The Office", title='המשרד (ארה"ב)')
        for target in (
            row(Provider.PARTNER, title="המשרד (בריטניה)"),
            row(Provider.PARTNER, title='המשרד (ארה"ב)', region="US"),
            row(Provider.PARTNER, title='המשרד (ארה"ב) (מדובב)'),
        ):
            self.assertIsNone(infer_original_titles([donor, target])[1].original_title)

    def test_minor_spacing_around_punctuation_is_normalized(self):
        donor = row(Provider.YES, "F.B.I", title="אף. בי. איי")
        target = row(Provider.PARTNER, title="אף.בי.איי | עונה 5")
        self.assertEqual(infer_original_titles([donor, target])[1].original_title, "F.B.I")


if __name__ == "__main__":
    unittest.main()
