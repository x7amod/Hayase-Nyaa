import {
  ANY_RESOLUTION_P_RE,
  BATCH_KEYWORD_RE,
  BATCH_SEASON_RANGE_RE,
  DIMENSION_RE,
  FIN_BRACKET_RE,
  K_RE,
  RANGE_FRAGMENT_RE,
  batchRangeRegexCache,
  resolutionRegexCache,
} from './constants.js'
import { classifyEpisode, stripEpisodeNoise } from './episode.js'
import { detectQuerySeason, detectResultSeason } from './season.js'
import { hasEpisodeMarker, hasSeasonMarker } from './utils.js'

export function matchesQuery(title, query, searchContext, queryTitles) {
  if (hasExcludedKeyword(title, query?.exclusions)) return false
  const metadata = resultMetadata(title, query, searchContext)
  const titles = Array.isArray(queryTitles) ? queryTitles : [queryTitles]
  if (query?.resolution && metadata && metadata.hasResolution && !metadata.resolution) return false
  if (query?.resolution && !metadata && hasAnyResolution(title) && !matchesResolution(title, query.resolution)) return false
  if (searchContext.mode !== 'movie') {
    const querySeason = searchContext.querySeason !== undefined ? searchContext.querySeason : detectQuerySeason(titles)
    if (querySeason) {
      const resultSeason = metadata ? metadata.resultSeason : detectResultSeason(title)
      if (resultSeason && resultSeason !== querySeason) return false
    }
  }
  if (searchContext.mode === 'single') {
    if (searchContext.episode != null && (metadata ? metadata.episode !== 'exact' : classifyEpisode(title, searchContext.episode) !== 'exact')) return false
  }
  if (searchContext.mode === 'batch') {
    if (metadata ? !metadata.batch : !matchesBatch(title, searchContext.episodeCount)) return false
  }
  return true
}

export function resultMetadata(title, query, searchContext) {
  const cache = searchContext.resultCache
  if (!cache) return null
  let metadata = cache.get(title)
  if (!metadata) {
    metadata = { title }
    cache.set(title, metadata)
  }
  if (query?.resolution && metadata.resolution === undefined) {
    metadata.hasResolution = hasAnyResolution(title)
    metadata.resolution = matchesResolution(title, query.resolution)
  }
  if (searchContext.mode !== 'movie' && metadata.resultSeason === undefined) metadata.resultSeason = detectResultSeason(title)
  if (searchContext.mode === 'single' && searchContext.episode != null && metadata.episode === undefined) metadata.episode = classifyEpisode(title, searchContext.episode)
  if (searchContext.mode === 'batch' && metadata.batch === undefined) metadata.batch = matchesBatch(title, searchContext.episodeCount)
  return metadata
}

export function hasExcludedKeyword(title, exclusions = []) {
  const lowered = title.toLowerCase()
  return exclusions.some(exclusion => {
    const value = String(exclusion).toLowerCase().trim()
    return value && lowered.includes(value)
  })
}

export function matchesResolution(title, resolution) {
  if (!resolution) return true
  const res = String(resolution)
  DIMENSION_RE.lastIndex = 0
  let match
  while ((match = DIMENSION_RE.exec(title))) {
    const height = match[0].split(/[xX]/)[1]
    if (height === res) return true
  }
  const withoutDimensions = String(title).replace(DIMENSION_RE, ' ')
  let regex = resolutionRegexCache.get(res)
  if (!regex) {
    regex = new RegExp(`(?:^|[^0-9])${res}p?(?:[^0-9]|$)`, 'i')
    resolutionRegexCache.set(res, regex)
  }
  return regex.test(withoutDimensions)
}

export function hasAnyResolution(title) {
  if (ANY_RESOLUTION_P_RE.test(title)) return true
  DIMENSION_RE.lastIndex = 0
  if (DIMENSION_RE.test(title)) return true
  return K_RE.test(title)
}

export function matchesBatch(title, episodeCount) {
  if (hasEpisodeMarker(title) && !RANGE_FRAGMENT_RE.test(title)) return false
  if (BATCH_KEYWORD_RE.test(title)) return true
  if (FIN_BRACKET_RE.test(title)) return true
  if (hasSeasonMarker(title) && !hasEpisodeMarker(title)) {
    const probe = episodeCount ?? 1
    if (classifyEpisode(title, probe) === 'absent') return true
  }
  if (BATCH_SEASON_RANGE_RE.test(title) && RANGE_FRAGMENT_RE.test(title)) return true
  if (episodeCount) {
    const key = String(episodeCount)
    let cached = batchRangeRegexCache.get(key)
    if (!cached) {
      const padded = String(episodeCount).padStart(2, '0')
      const start = '(?:0?1|01)'
      const end = `(?:0?${episodeCount}|${padded})`
      cached = {
        range: new RegExp(`(?:^|[^0-9])(?:ep\\.?\\s*)?${start}\\s*(?:[-~]|to|x|/)\\s*${end}(?:[^0-9]|$)`, 'i'),
        of: new RegExp(`(?:^|[^0-9])${start}\\s*of\\s*${end}(?:[^0-9]|$)`, 'i'),
      }
      batchRangeRegexCache.set(key, cached)
    }
    if (cached.range.test(title)) return true
    if (cached.of.test(title)) return true
  }
  if (episodeCount != null && classifyEpisode(title, episodeCount) === 'absent' && !hasEpisodeMarker(title)) return true
  if (episodeCount == null && !hasEpisodeMarker(title) && classifyEpisode(title, 1) === 'absent') return true
  return false
}
