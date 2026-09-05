import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getInternals } from '../helpers/loader.mjs'
import { SCENE_GROUP_TITLES, IRUMA_S4_EP10_TITLES } from '../fixtures/titles.mjs'

const {
  classifyEpisode,
  matchesQuery,
  matchesBatch,
  detectSeason,
  hasExcludedKeyword,
  matchesResolution,
  stripEpisodeNoise,
  buildSearchPlan,
  getSearchTitles,
  dedupeResults,
  rankResults,
} = getInternals()

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6
}

function assertFast(label, fn, maxMs) {
  const start = nowMs()
  fn()
  const elapsed = nowMs() - start
  assert.ok(elapsed <= maxMs, `${label} too slow: ${elapsed.toFixed(2)}ms > ${maxMs}ms`)
  return elapsed
}

describe('filtering and classifying performance', () => {
  it('classifyEpisode handles 10k titles quickly', () => {
    const titles = []
    const base = IRUMA_S4_EP10_TITLES.concat(Object.values(SCENE_GROUP_TITLES).flat())
    for (let i = 0; i < 10000; i++) {
      titles.push(base[i % base.length] + (i % 2 ? ` ${i % 100}` : ''))
    }
    const elapsed = assertFast('classifyEpisode 10k', () => {
      for (const t of titles) {
        classifyEpisode(t, 10)
        classifyEpisode(t, 1)
        classifyEpisode(t, 21)
      }
    }, 250)
    // sanity: ensure correct classification still works after bulk
    assert.strictEqual(classifyEpisode('[SubsPlease] Frieren - 12 (1080p)', 12), 'exact')
  })

  it('stripEpisodeNoise handles 10k titles quickly', () => {
    const titles = Array.from({ length: 10000 }, (_, i) => `[Erai-raws] Mairimashita Iruma-kun 4th Season - ${i % 24} [1080p]`)
    assertFast('stripEpisodeNoise 10k', () => {
      for (const t of titles) stripEpisodeNoise(t)
    }, 150)
  })

  it('matchesQuery filters 5k results quickly', () => {
    const query = { resolution: '1080', exclusions: ['x265'], titles: ['Mairimashita! Iruma-kun 4'] }
    const context = { mode: 'single', episode: 10, resolution: '1080' }
    const titles = []
    const pool = [...IRUMA_S4_EP10_TITLES, ...Object.values(SCENE_GROUP_TITLES).flat(), '[Erai-raws] Frieren - 12 [720p][HEVC]', '[SubsPlease] Bocchi the Rock! - 04 (1080p)']
    for (let i = 0; i < 5000; i++) titles.push(pool[i % pool.length])

    assertFast('matchesQuery 5k', () => {
      for (const t of titles) matchesQuery(t, query, context, ['Mairimashita! Iruma-kun 4'])
    }, 300)
  })

  it('matchesBatch and detectSeason handle 5k titles quickly', () => {
    const titles = Array.from({ length: 5000 }, (_, i) => `Mairimashita! Iruma-kun S3 [${String(i % 21 + 1).padStart(2, '0')}-${String(21).padStart(2, '0')}]`)
    assertFast('matchesBatch 5k', () => {
      for (const t of titles) {
        matchesBatch(t, 21)
        detectSeason(t)
      }
    }, 200)
  })

  it('hasExcludedKeyword and matchesResolution handle 5k titles quickly', () => {
    const titles = Array.from({ length: 5000 }, (_, i) => `[Group] Show - ${i % 12} [1080p][HEVC]`)
    assertFast('hasExcluded/hasResolution 5k', () => {
      for (const t of titles) {
        hasExcludedKeyword(t, ['x265', 'HEVC'])
        matchesResolution(t, '1080')
      }
    }, 150)
  })

  it('buildSearchPlan generates plans quickly (seasonal + non-seasonal)', () => {
    assertFast('buildSearchPlan 1k', () => {
      for (let i = 0; i < 1000; i++) {
        buildSearchPlan(['Koko wa Ore ni Makasete Saki ni Ike to Ittekara 10-nen ga Tattara Densetsu ni Natteita.', 'I Became a Legend After My 10 Year-Long Last Stand', 'KokoOre'], { mode: 'single', episode: 10, resolution: '1080' })
        buildSearchPlan(['Mairimashita! Iruma-kun 4th Season', 'Welcome to Demon School! Iruma-kun Season 4'], { mode: 'single', episode: 10, resolution: '1080' })
        buildSearchPlan(['Show Name'], { mode: 'batch', episodeCount: 12 })
      }
    }, 400)
  })

  it('getSearchTitles ignores synonyms quickly', () => {
    const query = {
      media: {
        title: { romaji: 'Koko wa Ore ni Makasete Saki ni Ike to Ittekara 10-nen ga Tattara Densetsu ni Natteita.', english: 'I Became a Legend After My 10 Year-Long Last Stand', native: 'ここは俺に任せて先に行けと言ってから１０年がたったら伝説になっていた。' },
        synonyms: ['KokoOre', 'Alternative Long Synonym Name That Should Be Included']
      },
      titles: ['fallback']
    }
    assert.deepStrictEqual(getSearchTitles(query), [
      'Koko wa Ore ni Makasete Saki ni Ike to Ittekara 10-nen ga Tattara Densetsu ni Natteita.',
      'I Became a Legend After My 10 Year-Long Last Stand',
      'KokoOre',
    ])
    assertFast('getSearchTitles 5k', () => {
      for (let i = 0; i < 5000; i++) getSearchTitles(query)
    }, 150)
  })

  it('dedupe and ranking handle 2k results quickly', () => {
    const results = Array.from({ length: 2000 }, (_, i) => ({
      title: `[Group] Show - ${i % 12 + 1} [1080p]`,
      link: `magnet:?xt=urn:btih:${String(i).padStart(40, '0')}`,
      hash: String(i).padStart(40, '0'),
      seeders: i % 100,
      leechers: 0,
      downloads: 0,
      size: 0,
      date: new Date(),
      accuracy: 'medium',
      Tags: []
    }))
    assertFast('dedupe+rank 2k', () => {
      const deduped = dedupeResults(results)
      rankResults(deduped, { resolution: '1080' }, { mode: 'single', episode: 5 }, ['Show'])
    }, 300)
  })
})
