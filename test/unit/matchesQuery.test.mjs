import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getExtension } from '../helpers/loader.mjs'
import { buildRss, makeItem, mockFetch } from '../helpers/rss.mjs'
import { SCENE_GROUP_TITLES, IRUMA_S4_EP10_TITLES, IRUMA_S4_WRONG_EP_TITLES } from '../fixtures/titles.mjs'

const Nyaa = getExtension()

async function searchSingle(titles, episode, resolution, items) {
  const rss = buildRss(items.map(t => makeItem({ title: typeof t === 'string' ? t : t.title, seeders: t.seeders ?? 100, hash: t.hash ?? undefined })))
  return Nyaa.single({ titles, episode, resolution, exclusions: [], fetch: mockFetch(rss) })
}

describe('matchesQuery — episode filtering', () => {
  it('keeps only the requested episode', async () => {
    const items = [...IRUMA_S4_EP10_TITLES, ...IRUMA_S4_WRONG_EP_TITLES]
    const results = await searchSingle(['Mairimashita! Iruma-kun 4'], 10, '1080', items)
    for (const r of results) {
      const m = r.title.match(/[-\s](\d{1,3})\s|E(\d{1,3})|S\d+E(\d{1,3})/i)
      const ep = m ? (m[1] || m[2] || m[3]) : null
      if (ep) assert.strictEqual(Number(ep), 10, `wrong episode in: ${r.title}`)
    }
  })

  it('filters out S04E16 when searching for ep 10', async () => {
    const results = await searchSingle(['Mairimashita! Iruma-kun 4'], 10, '1080', [
      '[Judas] Mairimashita! Iruma-kun (Welcome to Demon School) - S04E10 [1080p][HEVC x265 10bit]',
      '[Judas] Mairimashita! Iruma-kun (Welcome to Demon School) - S04E16 [1080p][HEVC x265 10bit]',
    ])
    assert.strictEqual(results.length, 1)
    assert.ok(results[0].title.includes('E10'))
  })

  it('filters out a range release in single mode', async () => {
    const results = await searchSingle(['Show'], 5, '1080', [
      '[SubsPlease] Show - 01-12 (1080p) [ABC].mkv',
    ])
    assert.strictEqual(results.length, 0)
  })

  it('keeps an S2 release for a query titled with roman-numeral II', async () => {
    const results = await searchSingle(
      ['Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu II', 'Skeleton Knight in Another World S2'],
      1,
      '1080',
      ['[SubsPlease] Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu S2 - 01 (1080p) [FEA68C8C].mkv']
    )
    assert.strictEqual(results.length, 1)
  })

  it('rejects a release whose parenthetical season conflicts with an Sxx marker', async () => {
    // VARYG copy-paste error: S03E05 main title with a "2nd Season" parenthetical.
    const results = await searchSingle(
      ['Kimi no Koto ga Dai Dai Dai Dai Daisuki na 100-nin no Kanojo 3rd Season'],
      5,
      '1080',
      ['The 100 Girlfriends Who Really Really Really Really REALLY Love You S03E05 1080p CR WEB-DL AAC2.0 H.264-VARYG (Kimi no Koto ga Daidaidaidaidaisuki na 100-nin no Kanojo 2nd Season, Multi-Subs)']
    )
    assert.strictEqual(results.length, 0)
  })

  it('accepts an absolute-numbered release for a seasonal episode', async () => {
    const results = await Nyaa.single({
      titles: ['Show'],
      episode: 1,
      absoluteEpisodeNumber: 26,
      resolution: '1080',
      exclusions: [],
      fetch: mockFetch(buildRss([makeItem({ title: '[Group] Show - 26 (1080p)', hash: 'c'.repeat(40) })])),
    })
    assert.strictEqual(results.length, 1)
  })

  it('rejects a result from a different season in glued SxxEyy notation', async () => {
    const results = await searchSingle(['Show 4'], 10, '1080', [
      '[Group] Show S03E10 [1080p]',
    ])
    assert.strictEqual(results.length, 0)
  })

  it('keeps the season from a qualified query title', async () => {
    const results = await searchSingle(['Show (Season 2)'], 1, '1080', [
      '[Group] Show S03E01 [1080p]',
    ])
    assert.strictEqual(results.length, 0)
  })

  it('rejects unrelated titles even when episode and resolution match', async () => {
    const results = await searchSingle(['Unique Anime'], 1, '1080', [
      '[Group] Completely Unrelated - 01 [1080p]',
    ])
    assert.strictEqual(results.length, 0)
  })
})

describe('matchesQuery — resolution filtering', () => {
  it('keeps only requested resolution', async () => {
    const results = await searchSingle(['Show Name'], 1, '1080', [
      makeItem({ title: '[SubsPlease] Show - 01 (1080p) [ABC].mkv' }),
      makeItem({ title: '[SubsPlease] Show - 01 (720p) [DEF].mkv' }),
      makeItem({ title: '[SubsPlease] Show - 01 (480p) [GHI].mkv' }),
    ])
    assert.ok(results.length >= 1)
    for (const r of results) {
      if (r.title.includes('720p') || r.title.includes('480p')) {
        assert.fail(`wrong resolution in: ${r.title}`)
      }
    }
  })

  it('does not treat an episode number as a resolution', async () => {
    const results = await searchSingle(['Show'], 1080, '1080', [
      '[Group] Show - 1080 [720p]',
    ])
    assert.strictEqual(results.length, 0)
  })

  it('recognizes high-frame-rate resolutions and 4K', async () => {
    const highFrameRate = await searchSingle(['Show'], 1, '720', [
      '[Group] Show - 01 [1080p60]',
    ])
    const fourK = await searchSingle(['Show'], 1, '2160', [
      '[Group] Show - 01 [4K]',
    ])
    assert.strictEqual(highFrameRate.length, 0)
    assert.strictEqual(fourK.length, 1)
  })
})

describe('matchesQuery — scene group survival', () => {
  const allTitles = Object.values(SCENE_GROUP_TITLES).flat()

  for (const title of allTitles) {
    const epMatch = title.match(/[-\s](\d{1,3})\s|E(\d{1,3})|S\d+E(\d{1,3})/i)
    const ep = epMatch ? Number(epMatch[1] || epMatch[2] || epMatch[3]) : null
    if (!ep) continue

    const is720p = title.includes('720p')
    const isWrongSeason = /3rd Season|Season 3|S3\b/i.test(title)

    if (is720p) {
      it(`filters 720p: ${title.slice(0, 80)}`, async () => {
        const results = await searchSingle(['Mairimashita! Iruma-kun 4'], ep, '1080', [title])
        assert.strictEqual(results.length, 0, '720p should be filtered when 1080 requested')
      })
    } else if (isWrongSeason) {
      it(`filters wrong season: ${title.slice(0, 80)}`, async () => {
        const results = await searchSingle(['Mairimashita! Iruma-kun 4'], ep, '1080', [title])
        assert.strictEqual(results.length, 0, 'S3 should be filtered when searching for S4')
      })
    } else if (!/Mairimashita|Iruma/i.test(title)) {
      it(`rejects unrelated title: ${title.slice(0, 80)}`, async () => {
        const results = await searchSingle(['Mairimashita! Iruma-kun 4'], ep, '1080', [title])
        assert.strictEqual(results.length, 0)
      })
    } else {
      it(`survives filter: ${title.slice(0, 80)}`, async () => {
        const results = await searchSingle(['Mairimashita! Iruma-kun 4'], ep, '1080', [title])
        assert.ok(results.length >= 1, `scene group title was filtered: ${title}`)
      })
    }
  }
})
