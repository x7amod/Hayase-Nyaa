# Hayase Nyaa Extension Memory

This repository contains a single Hayase torrent extension for searching Nyaa.
The extension is `hayase/nyaasi.js`. The two `index.json` files are published
manifests and are maintained manually.

## File Structure

`hayase/nyaasi.js` is organized as:

1. **0. Constants & shared regexes** — `RESOLUTIONS`, `RESOLUTION_P_RE`/`ANY_RESOLUTION_P_RE`,
   `DIMENSION_RE`, `K_RE`, `BATCH_KEYWORD_RE`, `FIN_BRACKET_RE`, `SEASON_MARKER_RE`,
   `EPISODE_MARKER_RE`, `BATCH_SEASON_RANGE_RE`, `RANGE_FRAGMENT_RE`, `ROMAN_RE`,
   `SIZE_MULTIPLIERS`, plus `resolutionRegexCache`/`batchRangeRegexCache`.
2. **1. Small utils** — `normalizeSearch`, `ordinalSuffix`, `makeDedupCollector`,
   `makePlanCollector`, `preparedBase`, `hasSeasonMarker`, `hasEpisodeMarker`.
3. **NyaaSi class** — `single`/`batch`/`movie`/`search`/`test` and `fetchSearchPlan`
   with `MAX_CONCURRENT_SEARCHES = 2`.
4. **Search plan** — `buildSearchPlan`, `getSearchTitles`, `stripQualifiers`,
   `scanBalanced`/`removeBalancedGroups`, `buildSearchVariants`, etc.
5. **Filtering** — `matchesQuery`, `detectQuerySeason`, `isPlausibleEpisode`,
   `hasExcludedKeyword`, `matchesResolution`/`hasAnyResolution`, `stripEpisodeNoise`,
   `detectSeason`/`detectResultSeason`, `classifyEpisode`, `matchesBatch`.
6. **Ranking & parsing** — `dedupeResults`, `rankResults`/`scoreResult`,
   `parseRssResults`/`decodeXmlEntities`, `parseSize`, `extractTags`.

## Search Flow

The extension exposes three search methods:

- `single(query)` searches for one episode.
- `batch(query)` searches for a complete season or batch.
- `movie(query)` searches for a movie.

Each search follows this flow:

1. Select search titles with `getSearchTitles`.
2. Build a deduplicated Nyaa RSS search plan.
3. Fetch plan entries with at most two requests in flight.
4. Parse RSS items into torrent results (with XML entity decoding).
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

- The requested episode number (supports `episode: 0` via `!= null` check).
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

- The title contains an excluded keyword (empty strings in `exclusions` are ignored).
- The result has a resolution that differs from the requested resolution. Any
  `###p` (e.g. `1440p`), `###x###` dimension (height determines resolution,
  stripped before bare-number check to avoid `720x1080` matching `720`), or
  `*K` (e.g. `4K`) is detected via `ANY_RESOLUTION_P_RE`/`DIMENSION_RE`/`K_RE`.
- The result has an explicitly conflicting season.
- A single-episode result does not contain the exact requested episode
  (`isPlausibleEpisode` uses `classifyEpisode === 'exact'`, with `episode == null`
  check so `0` is handled). `classifyEpisode` treats any compact range
  (`01-12`) as `range` even at endpoints, and multi-number titles (`10 & 11`)
  with distinct episode numbers as `range`, so they are rejected in single mode.
- A batch result does not look like a batch. `matchesBatch` reuses single's
  `EPISODE_MARKER_RE` via `hasEpisodeMarker`: if `hasEpisodeMarker(title)` is true
  and no `RANGE_FRAGMENT_RE` is present, the title is rejected as single-episode
  (covers `EP10`, `S01E10` — dash ranges like `01-21` are allowed because they
  contain a range fragment). Remaining batch signals are: `BATCH_KEYWORD_RE`
  (`batch|complete|fin|全集` — `full`/`collection`/`pack` removed to avoid
  `Full Metal Panic!` false positives), `FIN_BRACKET_RE`, season-only packs
  (`hasSeasonMarker && !hasEpisodeMarker && classifyEpisode === 'absent'` so
  `Season 3 01` is not misclassed), season+range, `1-21`/`01 ~ 21` range, or
  title-only (`classifyEpisode === 'absent' && !hasEpisodeMarker`, guarded for
  `episodeCount == null` vs `!= null` to keep `Title 1080p` while rejecting
  `Show 01` when count is missing).

In single mode, ranges and titles with no explicit episode marker are rejected
even if they include the requested episode indirectly. This avoids returning
season packs for an individual episode request.

RSS titles are decoded via `decodeXmlEntities` (`&amp;`, `&lt;`, `&gt;`,
`&quot;`, `&apos;`, `&#123;`, `&#xAB;`) after CDATA/tag stripping, and extracts
are trimmed. `parseSize` and tagging remain as before.

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
