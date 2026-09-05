import { matchesQuery } from './filter.js'
import { dedupeResults, rankResults } from './rank.js'
import { fetchSearchPlan, buildSearchPlan } from './plan.js'
import { getSearchTitles } from './titles.js'
import { toTorrentResult } from './rss.js'
import { detectQuerySeason } from './season.js'

const NyaaSi = new class NyaaSi {
  base = 'https://nyaa.si/?page=rss&c=1_2&q='

  single(query) {
    console.log('[NyaaSi] single()', { titles: query.titles, episode: query.episode, resolution: query.resolution, exclusions: query.exclusions, anilistId: query.anilistId })
    return this.search(query, { mode: 'single', episode: query.episode, resolution: query.resolution })
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
      const searchTitles = getSearchTitles(query)
      const searchPlan = buildSearchPlan(searchTitles, searchContext)
      if (!searchPlan.length) return []

      console.log('[NyaaSi] search plan:', searchPlan.map(entry => entry.term))
      const fetcher = query.fetch || fetch
      let results = []
      const queryTitles = searchPlan.map(entry => entry.sourceTitle)
      const outcomes = await fetchSearchPlan(fetcher, this.base, searchPlan)
      for (const outcome of outcomes) {
        if (outcome && outcome.status === 'fulfilled') results = dedupeResults(results.concat(outcome.value.map(toTorrentResult)))
      }

      console.log('[NyaaSi] raw results:', results.length)
      const resultContext = { ...searchContext, querySeason: detectQuerySeason(queryTitles), resultCache: new Map() }
      const filtered = results.filter(result => matchesQuery(result.title, query, resultContext, queryTitles))
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
