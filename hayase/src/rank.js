import { classifyEpisode } from './episode.js'
import { hasAnyResolution, matchesBatch, matchesResolution, resultMetadata } from './filter.js'
import { detectQuerySeason, detectResultSeason } from './season.js'

export function dedupeResults(results) {
  const seen = new Set()
  return results.filter(result => {
    const key = (result.hash || result.link || result.title || '').toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function rankResults(results, query, searchContext, queryTitles) {
  const titles = Array.isArray(queryTitles) ? queryTitles : [queryTitles]
  const rankingContext = searchContext.queryWordSets
    ? searchContext
    : { ...searchContext, queryWordSets: titles.map(wordSet) }
  return results
    .map(result => ({ ...result, _score: scoreResult(result, query, rankingContext, queryTitles) }))
    .sort((a, b) => b._score - a._score || b.seeders - a.seeders)
    .map(({ _score, ...result }) => result)
}

export function scoreResult(result, query, searchContext, queryTitles) {
  let score = 0
  const similarity = bestTitleSimilarity(queryTitles, result.title, searchContext.queryWordSets)
  if (similarity > 0.7) score += 40
  else if (similarity > 0.4) score += 12
  else score -= 15
  if (searchContext.mode === 'single' && searchContext.episode != null) {
    const metadata = resultMetadata(result.title, query, searchContext)
    const verdict = metadata ? metadata.episode : classifyEpisode(result.title, searchContext.episode)
    if (verdict === 'exact') score += 30
    else if (verdict === 'conflict') score -= 30
    const resultSeason = metadata ? metadata.resultSeason : detectResultSeason(result.title)
    const querySeason = searchContext.querySeason !== undefined ? searchContext.querySeason : detectQuerySeason(Array.isArray(queryTitles) ? queryTitles : [queryTitles])
    if (resultSeason && querySeason && resultSeason === querySeason) score += 8
  }
  const metadata = resultMetadata(result.title, query, searchContext)
  if (searchContext.mode === 'batch' && (metadata ? metadata.batch : matchesBatch(result.title, searchContext.episodeCount))) score += 30
  if (query?.resolution ? (metadata ? metadata.resolution : matchesResolution(result.title, query.resolution)) : true) score += 15
  else if (query?.resolution && (metadata ? metadata.hasResolution : hasAnyResolution(result.title))) score -= 5
  if (/\b(batch|complete|season|s\d{1,2})\b/i.test(result.title)) score += searchContext.mode === 'batch' ? 10 : -10
  score += Math.min(result.seeders || 0, 100) / 10
  return score
}

export function bestMatchingQueryTitle(queryTitles, resultTitle) {
  const titles = Array.isArray(queryTitles) ? queryTitles : [queryTitles]
  let bestTitle = titles[0] || ''
  let bestScore = -1
  for (const title of titles) {
    const score = titleSimilarity(title, resultTitle)
    if (score > bestScore) { bestScore = score; bestTitle = title }
  }
  return bestTitle
}

export function bestTitleSimilarity(queryTitles, resultTitle, preparedQueryWords) {
  const titles = Array.isArray(queryTitles) ? queryTitles : [queryTitles]
  const queryWords = preparedQueryWords || titles.map(wordSet)
  const resultWords = wordSet(resultTitle)
  let best = 0
  for (const words of queryWords) {
    if (!words.size) continue
    let matches = 0
    for (const word of words) if (resultWords.has(word)) matches++
    best = Math.max(best, matches / words.size)
  }
  return best
}

export function titleSimilarity(queryTitle, resultTitle) {
  const queryWords = wordSet(queryTitle)
  const resultWords = wordSet(resultTitle)
  if (!queryWords.size) return 0
  let matches = 0
  for (const word of queryWords) if (resultWords.has(word)) matches++
  return matches / queryWords.size
}

export function wordSet(value) {
  return new Set(String(value).toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(word => word.length > 1))
}
