import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getExtension, getInternals } from '../helpers/loader.mjs'

const { buildSearchPlan, getSearchTitles } = getInternals()
const Nyaa = getExtension()

describe('getSearchTitles', () => {
  it('uses preferred fields when building search requests', async () => {
    const requested = []
    await Nyaa.single({
      media: { title: { romaji: 'Romaji Name', english: 'English Name', native: 'Native Name' } },
      titles: ['Romaji Name', 'English Name', 'Native Name', 'Unrelated Synonym'],
      episode: 1,
      resolution: '',
      exclusions: [],
      fetch: async (url) => {
        requested.push(decodeURIComponent(url))
        return { ok: true, text: async () => '<rss></rss>' }
      },
    })

    assert.ok(requested.some(url => url.includes('Romaji Name')))
    assert.ok(requested.some(url => url.includes('English Name')))
    assert.ok(requested.every(url => !url.includes('Native Name') && !url.includes('Unrelated Synonym')))
  })

  it('keeps Hayase season aliases for preferred titles', () => {
    const titles = getSearchTitles({
      media: { title: { romaji: 'Show Season 2', english: null } },
      titles: ['Show Season 2', 'Show S2'],
    })

    assert.deepStrictEqual(titles, ['Show Season 2', 'Show S2'])
  })

  it('falls back to the supplied titles when preferred fields are unavailable', () => {
    const titles = ['Fallback Name', 'Alternate Name']
    assert.deepStrictEqual(getSearchTitles({ media: { title: { native: null } }, titles }), titles)
  })
})

describe('buildSearchPlan', () => {
  describe('single mode', () => {
    it('includes base title', () => {
      const plan = buildSearchPlan(['Show Name'], { mode: 'single', episode: 5 })
      const terms = plan.map(p => p.term)
      assert.ok(terms.includes('Show Name'))
    })

    it('includes episode-qualified term', () => {
      const plan = buildSearchPlan(['Show Name'], { mode: 'single', episode: 5 })
      const terms = plan.map(p => p.term)
      assert.ok(terms.some(t => t.includes('5')))
    })

    it('generates season-qualified terms when season detected', () => {
      const plan = buildSearchPlan(['Mairimashita! Iruma-kun 4'], { mode: 'single', episode: 10 })
      const terms = plan.map(p => p.term)
      assert.ok(terms.some(t => t.includes('S04')), 'should have S04 variant')
      assert.ok(terms.some(t => t.includes('Season 4')), 'should have Season 4 variant')
    })

    it('generates !-stripped variants', () => {
      const plan = buildSearchPlan(['Mairimashita! Iruma-kun 4'], { mode: 'single', episode: 10 })
      const terms = plan.map(p => p.term)
      assert.ok(terms.some(t => t.includes('Mairimashita Iruma-kun') && !t.includes('!')),
        'should have !-stripped variant')
    })

    it('removes repeated trailing qualifiers', () => {
      const plan = buildSearchPlan(['Show (Dub) [1080p]'], { mode: 'movie' })
      const terms = plan.map(p => p.term)
      assert.ok(terms.includes('Show (Dub)'))
      assert.ok(terms.includes('Show [1080p]'))
      assert.ok(terms.includes('Show'))
    })

    it('removes nested trailing qualifiers', () => {
      const title = 'Show (Dub (Dual Audio)) [1080p]'
      const plan = buildSearchPlan([title], { mode: 'single', episode: 4 })
      const terms = plan.map(p => p.term)
      assert.ok(terms.includes('Show'))
      assert.ok(terms.includes('Show 4'))
    })
  })

  describe('batch mode', () => {
    it('includes batch keyword term', () => {
      const plan = buildSearchPlan(['Show Name'], { mode: 'batch', episodeCount: 12 })
      const terms = plan.map(p => p.term)
      assert.ok(terms.some(t => t.includes('batch')), `terms: ${terms.join(', ')}`)
    })

    it('includes complete keyword term', () => {
      const plan = buildSearchPlan(['Show Name'], { mode: 'batch', episodeCount: 12 })
      const terms = plan.map(p => p.term)
      assert.ok(terms.some(t => t.includes('complete')))
    })

    it('includes range terms with episodeCount', () => {
      const plan = buildSearchPlan(['Show Name'], { mode: 'batch', episodeCount: 21 })
      const terms = plan.map(p => p.term)
      assert.ok(terms.some(t => t.includes('1-21')), `terms: ${terms.join(', ')}`)
      assert.ok(terms.some(t => t.includes('01-21')))
    })

    it('includes tilde range terms', () => {
      const plan = buildSearchPlan(['Show Name'], { mode: 'batch', episodeCount: 21 })
      const terms = plan.map(p => p.term)
      assert.ok(terms.some(t => t.includes('01 ~ 21')), `terms: ${terms.join(', ')}`)
    })

    it('does not include episode-qualified terms', () => {
      const plan = buildSearchPlan(['Show Name'], { mode: 'batch', episodeCount: 12 })
      const terms = plan.map(p => p.term)
      assert.ok(!terms.some(t => /^Show Name \d+$/.test(t)),
        'should not have bare episode-qualified term')
    })
  })

  describe('deduplication', () => {
    it('does not produce duplicate terms', () => {
      const plan = buildSearchPlan(['Show', 'Show'], { mode: 'single', episode: 1 })
      const terms = plan.map(p => p.term)
      const unique = [...new Set(terms)]
      assert.strictEqual(terms.length, unique.length)
    })
  })
})
