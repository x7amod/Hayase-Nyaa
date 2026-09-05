# Hayase Nyaa Extension Memory

This repository contains a single Hayase torrent extension for searching Nyaa.
The source is split under `hayase/src/`; `hayase/nyaasi.js` is the generated
single-file worker artifact served by the manifest. The two `index.json` files
are published manifests and are maintained manually.

## File Structure

The source modules are organized as:

1. **`src/constants.js`** — shared regexes, season map, caches, and concurrency settings.
2. **`src/utils.js`** — normalization, dedupe collectors, base preparation, and shared title predicates.
3. **`src/titles.js`** — media title selection, qualifier removal, and search-title variants.
4. **`src/season.js`** — query/result season detection.
5. **`src/episode.js`** — episode-noise stripping and episode classification.
6. **`src/rss.js`** — Nyaa fetches, RSS parsing, XML decoding, and result conversion.
7. **`src/plan.js`** — search-plan construction and concurrent budgeted fetching.
8. **`src/filter.js`** — exclusions, resolution, season, episode, and batch predicates.
9. **`src/rank.js`** — result dedupe, title similarity, scoring, and ranking.
10. **`src/index.js`** — the `NyaaSi` public class and module exports.

`hayase/nyaasi.js` must remain a bundled single-file artifact because the
manifest loads it directly in Hayase's worker. `npm run build` bundles the
small `src/runtime.js` entry and minifies the result; edit `hayase/src/` rather
than the generated file.

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
5. Add short single-token aliases from `media.synonyms` (Latin script,
   length 4–16, no spaces): release groups title with the shorthand, which
   full titles can never AND-match. Longer synonyms are alternate full
   titles and are skipped.
6. If neither explicit field is available, fall back to at most the first
   three Latin-script entries of `query.titles`.

Native titles, long synonyms, and the rest of `query.titles` are never
searched: entries carry too many of them and each extra title multiplies
the plan toward the extension time budget. (Hayase itself builds
`query.titles` as romaji, english, native, userPreferred, then all
synonyms, each with season-alias and hyphen-less expansions — see
`createTitles` in the interface repo.) Punctuation-only duplicates of a
kept title are dropped. When Latin filtering would leave nothing, the
first three raw entries are kept.

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
- Short distinctive phrases: the word next to a parenthesized qualifier,
  and capitalized runs inside the tail segment after a top-level comma or
  colon (release groups often shorten the catalog title).
- Preserve normalized variants without duplicate requests.

Terms are ordered most-selective-first (episode-qualified, then season
variants, then base/variant terms). Fetching races the plan against a time
budget instead of awaiting every term, so a slow source degrades to partial
results rather than failing the whole search.

For `single` searches, each title also gets:

- The requested episode number (supports `episode: 0` via `!= null` check).
- A zero-padded episode number when different, such as `01`.
- The requested resolution, such as `10 1080p`.
- The same episode variants with `!` and `?` removed.

When a season is detected, extra terms use the base with its own season
marker stripped plus `S04`, `Season 4`, and ordinal notation such as `4th
Season`, plus glued `S04E10` tokens (a spaced episode number can also match
digits inside unrelated tokens, burying the wanted episode past page one).
Season detection reads the selected query titles, not torrent result titles.
It recognizes `S2`, `Season 2`, `2nd Season`, trailing ordinals, Roman
numerals, and trailing bare season numbers. A lone single-character numeral
inside prose is ignored (it is usually a word, not a season); only a
trailing one counts.

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

Regenerate the published worker after source changes with:

```bash
npm run build
```

Run all tests, including live Nyaa integration tests, with:

```bash
npm run test:all
```

GitHub Actions runs the unit tests on Node.js 22 only.

## Debugging Extensions With Chrome DevTools MCP

Use this workflow when Hayase displays too few or no results from an
extension:

1. List open pages with `chrome-devtools_list_pages`, then select the Hayase
   page with `chrome-devtools_select_page`.
2. Take an accessibility snapshot with `chrome-devtools_take_snapshot` to
   identify the current route, anime title, episode controls, resolution, and
   result elements.
3. Reproduce the problem from the UI. Navigate to the anime, select the
   affected episode, and wait for the result list with
   `chrome-devtools_wait_for`.
4. Read extension diagnostics with
   `chrome-devtools_list_console_messages`, including preserved messages. Use
   `chrome-devtools_get_console_message` for individual entries so object and
   array arguments are expanded. Extension logs commonly reveal search
   inputs, generated queries, raw result counts, filtered result counts, and
   final titles.
5. Inspect `chrome-devtools_list_network_requests` and filter for the source
   requests (`nyaa.si` here). Confirm every generated search request, HTTP
   status, and whether requests are still pending or failed.
6. Use `chrome-devtools_get_network_request` to save or inspect response
   bodies for suspicious source searches. Compare the source RSS/API items
   with the titles shown by Hayase. This distinguishes missing upstream data
   from local parsing or filtering.
7. Trace the count change through the extension logs and source code. For
   this extension, the main stages are search-plan generation, RSS parsing,
   hash/link deduplication, `matchesQuery()` filtering, and ranking.
8. For a dropped candidate, check each predicate independently: exclusions,
   resolution, season, and episode classification. Add a focused regression
   test before changing a parser or filter.
9. Reload or reproduce once after a change and verify both the Console counts
   and the visible result titles. Also check for stale requests or logs from
   an earlier anime before drawing conclusions.

Useful evidence to record is the exact Hayase route, AniList ID, episode,
resolution, console count transition, relevant request URLs/statuses, and the
source title of at least one expected-but-missing result.
