# Hayase Nyaa Extension Memory

This repository contains a single Hayase torrent extension for searching Nyaa.
The extension is `hayase/nyaasi.js`. The two `index.json` files are published
manifests and are maintained manually.

## Search Flow

The extension exposes three search methods:

- `single(query)` searches for one episode.
- `batch(query)` searches for a complete season or batch.
- `movie(query)` searches for a movie.

Each search follows this flow:

1. Select search titles with `getSearchTitles`.
2. Build a deduplicated Nyaa RSS search plan.
3. Fetch plan entries with at most two requests in flight.
4. Parse RSS items into torrent results.
5. Deduplicate results by hash, link, or title.
6. Filter results by exclusions, resolution, season, and search mode.
7. Rank the remaining results by title similarity, episode or batch match,
   resolution, season alignment, and seeders.

Individual search-term failures are ignored. If the overall search logic
throws, the extension returns an empty result list.

## Title Selection

Hayase passes an AniList media object and a `titles` array to extensions. The
media title object can contain `romaji`, `english`, `native`, and
`userPreferred`; the array can also contain synonyms and generated aliases.

`getSearchTitles(query)` uses titles in this order:

1. Use `query.media.title.romaji` when it is a non-empty string.
2. Use `query.media.title.english` when it is a non-empty string.
3. Normalize whitespace and Unicode compatibility characters, then deduplicate
   case-insensitively.
4. For each preferred title, add a season alias when applicable:
   `Season 2` becomes `S2`, and `2nd Season` becomes `S2`.
5. If neither explicit field is available, fall back to `query.titles`.

When at least one Romaji or English field exists, the fallback array is not
used. This prevents native-language titles, user-preferred titles, and
unrelated synonyms from creating extra Nyaa requests.

There is no Japanese-script stripping or detection anymore. A Japanese title
can still be searched when it is supplied by the fallback `query.titles` array,
or if AniList itself provides it in a Romaji or English field.

Search title order has little practical effect because every selected title is
searched and the combined results are ranked afterward.

## Search Plan

All selected title candidates get a base search request. Additional variants
are generated to match common release naming differences:

- Remove trailing parenthesized or bracketed qualifiers.
- Remove text after a top-level colon.
- Remove `!` and `?` punctuation.
- Preserve normalized variants without duplicate requests.

For `single` searches, each title also gets:

- The requested episode number.
- A zero-padded episode number when different, such as `01`.
- The requested resolution, such as `10 1080p`.
- The same episode variants with `!` and `?` removed.

When a season is detected, extra terms use `S04`, `Season 4`, and ordinal
notation such as `4th Season`. Season detection reads the selected query
titles, not torrent result titles. It recognizes `S2`, `Season 2`, `2nd
Season`, trailing ordinals, Roman numerals, and trailing bare season numbers.

For `batch` searches, the plan adds `batch`, `complete`, and episode-range
terms such as `1-21`, `01-21`, and `01 ~ 21`. A batch search is skipped when
`query.media.status` is `RELEASING`.

Movie searches use the base and stripped title variants without episode or
batch terms.

## Result Filtering

Before ranking, results are rejected when:

- The title contains an excluded keyword.
- The result has a resolution that differs from the requested resolution.
- The result has an explicitly conflicting season.
- A single-episode result does not contain the exact requested episode.
- A batch result does not look like a batch, complete release, season pack, or
  matching episode range.

In single mode, ranges and titles with no explicit episode marker are rejected
even if they include the requested episode indirectly. This avoids returning
season packs for an individual episode request.

## Repository Maintenance

The repository no longer has a manifest generator. Update both `index.json`
and `hayase/index.json` manually when manifest metadata changes. The root
manifest is used for repository installation; the nested manifest is used by
the extension update URL.

Run the offline test suite with:

```bash
npm test
```

GitHub Actions runs the unit tests on Node.js 22 only.
