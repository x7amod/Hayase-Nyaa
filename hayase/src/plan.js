import { MAX_CONCURRENT_SEARCHES } from './constants.js'
import { detectQuerySeason } from './season.js'
import { fetchResults } from './rss.js'
import { buildSearchVariants, stripTrailingSeasonMarker } from './titles.js'
import { makePlanCollector, normalizeSearch, ordinalSuffix, preparedBase } from './utils.js'

export async function fetchSearchPlan(fetcher, base, searchPlan, budgetMs = 9000) {
  const outcomes = new Array(searchPlan.length)
  let nextIndex = 0
  let stopped = false

  const worker = async () => {
    while (nextIndex < searchPlan.length && !stopped) {
      const index = nextIndex++
      const { term } = searchPlan[index]
      try {
        outcomes[index] = {
          status: 'fulfilled',
          value: await fetchResults(fetcher, base, term),
        }
      } catch (reason) {
        outcomes[index] = { status: 'rejected', reason }
      }
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_SEARCHES, searchPlan.length)
  let timer
  try {
    await Promise.race([
      Promise.all(Array.from({ length: workerCount }, worker)),
      new Promise(resolve => {
        timer = setTimeout(() => { stopped = true; resolve() }, budgetMs)
        if (timer && typeof timer.unref === 'function') timer.unref()
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
  return outcomes
}

export function buildSearchPlan(titles = [], searchContext = {}) {
  const { plan, add } = makePlanCollector()
  const cleanTitles = (titles || [])
    .filter(title => typeof title === 'string' && title.trim())
    .map(normalizeSearch)
    .filter(Boolean)

  if (searchContext.mode === 'single' && searchContext.episode != null) {
    const episode = searchContext.episode
    const padded = String(episode).padStart(2, '0')
    const resolution = searchContext.resolution

    for (const base of cleanTitles) {
      const { stripped, clean, needsClean } = preparedBase(base)
      if (resolution) {
        add(`${stripped} ${episode} ${resolution}p`, stripped)
        if (needsClean) add(`${clean} ${episode} ${resolution}p`, clean)
      } else {
        add(`${stripped} ${episode}`, stripped)
        if (padded !== String(episode)) add(`${stripped} ${padded}`, stripped)
        if (needsClean) {
          add(`${clean} ${episode}`, clean)
          if (padded !== String(episode)) add(`${clean} ${padded}`, clean)
        }
      }
    }

    const season = detectQuerySeason(cleanTitles)
    if (season) {
      const suffix = ordinalSuffix(season)
      const paddedSeason = String(season).padStart(2, '0')
      const paddedEpisode = String(episode).padStart(2, '0')
      for (const base of cleanTitles) {
        const { clean } = preparedBase(base)
        const seasonless = stripTrailingSeasonMarker(clean, season)
        add(`${seasonless} S${paddedSeason} ${episode}`, clean)
        add(`${seasonless} S${season} ${episode}`, clean)
        add(`${seasonless} Season ${season} ${episode}`, clean)
        add(`${seasonless} ${season}${suffix} Season ${episode}`, seasonless)
        add(`${seasonless} S${paddedSeason}E${paddedEpisode}`, clean)
        add(`${seasonless} S${season}E${paddedEpisode}`, clean)
      }
    }
  }

  for (const base of cleanTitles) add(base, base)
  for (const base of cleanTitles) {
    for (const variant of buildSearchVariants(base)) add(variant, base)
  }

  if (searchContext.mode === 'batch') {
    const episodeCount = searchContext.episodeCount
    const padded = episodeCount ? String(episodeCount).padStart(2, '0') : null
    for (const base of cleanTitles) {
      const { clean } = preparedBase(base)
      add(`${clean} batch`, clean)
      add(`${clean} complete`, clean)
      add(`${clean} season`, clean)
      if (episodeCount) {
        add(`${clean} 1-${episodeCount}`, clean)
        add(`${clean} 01-${padded}`, clean)
        add(`${clean} 01-${episodeCount}`, clean)
        add(`${clean} 1-${padded}`, clean)
        add(`${clean} 01 ~ ${padded}`, clean)
        add(`${clean} 1 ~ ${episodeCount}`, clean)
      }
    }
    const season = detectQuerySeason(cleanTitles)
    if (season) {
      const suffix = ordinalSuffix(season)
      for (const base of cleanTitles) {
        const { clean } = preparedBase(base)
        const ordinalBase = stripTrailingSeasonMarker(clean, season) || clean
        add(`${ordinalBase} ${season}${suffix} Season batch`, ordinalBase)
        add(`${ordinalBase} ${season}${suffix} Season complete`, ordinalBase)
        add(`${ordinalBase} ${season}${suffix} Season season`, ordinalBase)
        if (episodeCount) {
          add(`${ordinalBase} ${season}${suffix} Season 1-${episodeCount}`, ordinalBase)
          add(`${ordinalBase} ${season}${suffix} Season 01-${padded}`, ordinalBase)
          add(`${ordinalBase} ${season}${suffix} Season 01 ~ ${padded}`, ordinalBase)
          add(`${ordinalBase} ${season}${suffix} Season 1 ~ ${episodeCount}`, ordinalBase)
        }
      }
    }
  }

  return plan
}
