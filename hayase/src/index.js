import { DEFAULT_SEARCH_BUDGET_MS } from './constants.js'
import { matchesQuery } from './filter.js'
import { rankResults } from './rank.js'
import { fetchSearchPlan, buildPrimarySearchPlan, buildSearchPlan } from './plan.js'
import { getPrimarySearchTitles, getSearchTitles } from './titles.js'
import { toTorrentResult } from './rss.js'
import { detectQuerySeason } from './season.js'

const NyaaSi = new class NyaaSi {
  base = 'https://nyaa.si/?page=rss&c=1_2&q='

  single(query) {
    console.log('[NyaaSi] single()', { titles: query.titles, episode: query.episode, resolution: query.resolution, exclusions: query.exclusions, anilistId: query.anilistId })
    return this.search(query, {
      mode: 'single',
      episode: query.episode,
      absoluteEpisodeNumber: query.absoluteEpisodeNumber,
      episodeNumbers: [query.episode, query.absoluteEpisodeNumber],
      resolution: query.resolution,
    })
  }

  batch(query) {
    console.log('[NyaaSi] batch()', { titles: query.titles, episodeCount: query.episodeCount, resolution: query.resolution, exclusions: query.exclusions, anilistId: query.anilistId })
    console.log('[NyaaSi] media.status:', query.media?.status)
    if (query.media?.status === 'RELEASING') {
      console.log('[NyaaSi] skipping batch - show is still airing')
      return []
    }
    return this.search(query, { mode: 'batch', episodeCount: query.episodeCount })
  }

  movie(query) {
    console.log('[NyaaSi] movie()', { titles: query.titles, resolution: query.resolution, exclusions: query.exclusions, anilistId: query.anilistId })
    return this.search(query, { mode: 'movie' })
  }

  async search(query, searchContext) {
    try {
      const startTime = Date.now()
      const primaryTitles = getPrimarySearchTitles(query)
      const searchTitles = getSearchTitles(query)
      const primaryPlan = buildPrimarySearchPlan(primaryTitles, searchContext)
      const fullPlan = buildSearchPlan(searchTitles, searchContext)
      if (!primaryPlan.length && !fullPlan.length) return []

      console.log('[NyaaSi] primary search plan:', primaryPlan.map(entry => entry.term))
      const fetcher = query.fetch || fetch
      const results = []
      const filtered = []
      const seen = new Set()
      const queryTitles = [...new Set([...searchTitles, ...fullPlan.map(entry => entry.sourceTitle)])]
      const resultContext = { ...searchContext, querySeason: detectQuerySeason(searchTitles), resultCache: new Map() }
      const collectOutcomes = (outcomes) => {
        for (const outcome of outcomes) {
          if (!outcome || outcome.status !== 'fulfilled') continue
          for (const item of outcome.value) {
            const result = toTorrentResult(item)
            const key = (result.hash || result.link || result.title || '').toLowerCase()
            if (!key || seen.has(key)) continue
            seen.add(key)
            results.push(result)
            if (matchesQuery(result.title, query, resultContext, queryTitles)) filtered.push(result)
          }
        }
      }

      collectOutcomes(await fetchSearchPlan(fetcher, this.base, primaryPlan, DEFAULT_SEARCH_BUDGET_MS))

      if (!filtered.length) {
        const primaryTerms = new Set(primaryPlan.map(entry => entry.term.toLowerCase()))
        const fallbackPlan = fullPlan.filter(entry => !primaryTerms.has(entry.term.toLowerCase()))
        const remainingBudget = DEFAULT_SEARCH_BUDGET_MS - (Date.now() - startTime)
        if (fallbackPlan.length && remainingBudget > 0) {
          console.log('[NyaaSi] fallback search plan:', fallbackPlan.map(entry => entry.term))
          collectOutcomes(await fetchSearchPlan(fetcher, this.base, fallbackPlan, remainingBudget))
        }
      }

      console.log('[NyaaSi] raw results:', results.length)
      console.log('[NyaaSi] after filter:', filtered.length)
      const ranked = rankResults(filtered, query, resultContext, queryTitles)
      console.log('[NyaaSi] final results:', ranked.map(result => {
        const episode = result.title.match(/[-\s](\d{1,3})\s|E(\d{1,3})|S\d+E(\d{1,3})/i)
        const episodeNumber = episode ? (episode[1] || episode[2] || episode[3]) : '??'
        return episodeNumber + ' ' + result.title.slice(0, 70)
      }))
      return ranked
    } catch (error) {
      console.error('[NyaaSi] search error:', error)
      return []
    }
  }

  async test() {
    try {
      const response = await fetch(this.base + 'test')
      if (!response.ok) throw new Error(`Nyaa returned HTTP ${response.status}.`)
      return true
    } catch (error) {
      throw new Error(`Nyaa is unavailable: ${error.message}`)
    }
  }
}()

export default NyaaSi
export { NyaaSi }
export * from './constants.js'
export * from './utils.js'
export * from './season.js'
export * from './episode.js'
export * from './titles.js'
export * from './rss.js'
export * from './plan.js'
export * from './filter.js'
export * from './rank.js'
