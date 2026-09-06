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

  it('ignores long synonyms but keeps short single-token aliases', () => {
    const titles = getSearchTitles({
      media: { title: { romaji: 'Romaji Name', english: 'English Name', native: 'Native Name' }, synonyms: ['ShortAlias', 'Another Synonym', 'Yet Another Synonym', 'AVeryLongSingleTokenSynonym'] },
      titles: ['Romaji Name', 'English Name', 'Native Name', 'ShortAlias', 'Extra Alias'],
    })

    assert.deepStrictEqual(titles, ['Romaji Name', 'English Name', 'ShortAlias'])
  })

  it('caps the fallback titles when preferred fields are unavailable', () => {
    const titles = getSearchTitles({
      media: { title: { native: null } },
      titles: ['One', 'Two', 'Three', 'Four', 'Five'],
    })

    assert.deepStrictEqual(titles, ['One', 'Two', 'Three'])
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
    it('does not include an unqualified base title', () => {
      const plan = buildSearchPlan(['Show Name'], { mode: 'single', episode: 5 })
      const terms = plan.map(p => p.term)
      assert.ok(!terms.includes('Show Name'))
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

    it('generates de-seasoned S-variant terms for roman-numeral seasons', () => {
      // Releases use "Odekakechuu S2 - 01" while AniList titles use "... Odekakechuu II":
      // no plan term may require both II and S02 at once.
      const plan = buildSearchPlan(
        ['Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu II'],
        { mode: 'single', episode: 1 }
      )
      const terms = plan.map(p => p.term)
      assert.ok(
        terms.includes('Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu S02 1'),
        `should have de-seasoned S02 term, got: ${terms.join(' | ')}`
      )
      assert.ok(
        terms.includes('Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu S2 1'),
        'should have de-seasoned unpadded S2 term'
      )
      assert.ok(
        terms.includes('Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu Season 2 1'),
        'should have de-seasoned Season 2 term'
      )
      assert.ok(
        !terms.some(t => t.includes('II') && t.includes('S02')),
        'should not require II and S02 together'
      )
    })

    it('generates de-seasoned S-variant terms for trailing bare-number seasons', () => {
      const plan = buildSearchPlan(['Mairimashita! Iruma-kun 4'], { mode: 'single', episode: 10 })
      const terms = plan.map(p => p.term)
      assert.ok(
        terms.includes('Mairimashita Iruma-kun S04 10'),
        `should have de-seasoned S04 term, got: ${terms.join(' | ')}`
      )
    })

    it('generates glued SxxEyy terms that isolate the episode', () => {
      // A spaced "S04 10" also matches "1080p" (contains "10"), flooding
      // page one with other episodes; the glued token isolates E10.
      const plan = buildSearchPlan(['Mairimashita! Iruma-kun 4'], { mode: 'single', episode: 10 })
      const terms = plan.map(p => p.term)
      assert.ok(terms.includes('Mairimashita Iruma-kun S04E10'), 'should have glued S04E10 term')
      const plan2 = buildSearchPlan(
        ['Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu II'],
        { mode: 'single', episode: 1 }
      )
      assert.ok(
        plan2.map(p => p.term).includes('Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu S02E01'),
        'should have glued S02E01 term'
      )
    })

    it('does not emit spurious S01 terms for season-less English titles starting with I', () => {
      const plan = buildSearchPlan(
        ['Koko wa Ore ni Makasete Saki ni Ike to Ittekara 10-nen ga Tattara Densetsu ni Natteita.', 'I Became a Legend After My 10 Year-Long Last Stand'],
        { mode: 'single', episode: 10, resolution: '1080' }
      )
      const terms = plan.map(p => p.term)
      assert.ok(!terms.some(t => /\bS01\b/.test(t) || /\bSeason 1\b/.test(t)), 'should have no season-1 terms')
    })

    it('generates paren-adjacent phrase variants', () => {
      // Groups release "Kanteishi (Kari) - 11" under a fragment of the long romaji title.
      const plan = buildSearchPlan(
        ['Saikyou no Shokugyou wa Yuusha demo Kenja demo Naku Kanteishi (Kari) Rashii desu yo?'],
        { mode: 'batch', episodeCount: 11 }
      )
      const terms = plan.map(p => p.term)
      assert.ok(terms.includes('Kanteishi (Kari)'), `should have Kanteishi (Kari) variant, got: ${terms.join(' | ')}`)
    })

    it('generates capitalized-run variants for comma-led titles', () => {
      // Groups release "All Works Maid - 07" under the tail segment of the long title.
      const plan = buildSearchPlan(
        ['Heroine? Seijo? Iie, All Works Maid desu (Ko)!'],
        { mode: 'batch', episodeCount: 7 }
      )
      const terms = plan.map(p => p.term)
      assert.ok(terms.includes('All Works Maid'), `should have All Works Maid variant, got: ${terms.join(' | ')}`)
    })

    it('drops non-Latin titles from the fallback title list', () => {
      const titles = getSearchTitles({
        media: { title: {} },
        titles: ['Romaji Title', 'クラスで２番目に可愛い女の子と友だちになった', 'Я подружился со второй красоткой класса', 'รักเธอหมดหัวใจ ซีซั่น 3', 'KokoOre'],
      })
      assert.deepStrictEqual(titles, ['Romaji Title', 'KokoOre'])
    })

    it('drops punctuation-only duplicates from the fallback title list', () => {
      const titles = getSearchTitles({
        media: { title: {} },
        titles: ['Mairimashita! Iruma-kun 4', 'Mairimashita! Irumakun 4', 'Welcome to Demon School! Iruma-kun Season 4'],
      })
      assert.deepStrictEqual(titles, ['Mairimashita! Iruma-kun 4', 'Welcome to Demon School! Iruma-kun Season 4'])
    })

    it('orders episode-qualified terms before plain base terms', () => {
      const plan = buildSearchPlan(['Show Name'], { mode: 'single', episode: 5, resolution: '1080' })
      const terms = plan.map(p => p.term)
      assert.ok(terms[0].includes('5'), `most selective term should lead, got: ${terms[0]}`)
      assert.ok(!terms.includes('Show Name'), 'plain base term belongs to batch/movie searches')
    })

    it('includes padded episode terms when resolution is specified', () => {
      const terms = buildSearchPlan(['Show Name'], { mode: 'single', episode: 1, resolution: '1080' }).map(p => p.term)
      assert.ok(terms.includes('Show Name 1 1080p'))
      assert.ok(terms.includes('Show Name 01 1080p'))
    })

    it('searches absolute episode numbers as well as seasonal episode numbers', () => {
      const terms = buildSearchPlan(['Show Name'], { mode: 'single', episode: 1, absoluteEpisodeNumber: 26 }).map(p => p.term)
      assert.ok(terms.includes('Show Name 1'))
      assert.ok(terms.includes('Show Name 26'))
    })

    it('preserves meaningful title qualifiers in single searches', () => {
      const terms = buildSearchPlan(['Show: Subtitle'], { mode: 'single', episode: 1, resolution: '1080' }).map(p => p.term)
      assert.ok(terms.includes('Show: Subtitle 1 1080p'))
    })

    it('does not emit two-word tail runs', () => {
      // A name-internal comma is not a clause break worth an extra request.
      const plan = buildSearchPlan(
        ['Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu II'],
        { mode: 'single', episode: 1 }
      )
      const terms = plan.map(p => p.term)
      assert.ok(!terms.includes('Tadaima Isekai'), 'two-word fragments add requests without recall')
    })

    it('keeps the original list when no Latin title exists', () => {
      const titles = ['クラスで２番目に可愛い女の子と友だちになった']
      assert.deepStrictEqual(getSearchTitles({ media: { title: {} }, titles }), titles)
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
      assert.ok(!terms.includes('Show'))
      assert.ok(terms.includes('Show 4'))
    })
  })

  describe('batch mode', () => {
    it('prioritizes batch-specific terms before broad variants', () => {
      const plan = buildSearchPlan(['A Long Show: Subtitle (Dub)'], { mode: 'batch', episodeCount: 12 })
      const batchIndex = plan.findIndex(entry => entry.term.endsWith(' batch'))
      const baseIndex = plan.findIndex(entry => entry.term === 'A Long Show: Subtitle (Dub)')
      assert.ok(batchIndex >= 0)
      assert.ok(baseIndex > batchIndex)
    })

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
