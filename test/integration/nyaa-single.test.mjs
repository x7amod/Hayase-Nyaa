import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getExtension } from '../helpers/loader.mjs'

const Nyaa = getExtension()
const SKIP = process.env.CI === 'true'

describe('nyaa-single', { skip: SKIP }, () => {
  describe('Iruma-kun S4 ep16', () => {
    let results
    it('returns results', async () => {
      results = await Nyaa.single({
        anilistId: 131141,
        titles: ['Mairimashita! Iruma-kun 4'],
        episode: 16,
        episodeCount: 21,
        resolution: '1080',
        exclusions: [],
        fetch: (url) => fetch(url),
      })
      assert.ok(results.length > 0, 'should return results')
    })

    it('returns only ep 16', () => {
      for (const r of results) {
        const m = r.title.match(/[-\s](\d{1,3})\s|E(\d{1,3})|S\d+E(\d{1,3})/i)
        const ep = m ? (m[1] || m[2] || m[3]) : null
        if (ep) assert.strictEqual(Number(ep), 16, `wrong episode: ${r.title}`)
      }
    })

    it('includes Erai-raws', () => {
      assert.ok(results.some(r => r.title.includes('Erai-raws')), 'should include Erai-raws')
    })

    it('filters to 1080p only', () => {
      for (const r of results) {
        if (r.title.includes('720p') || r.title.includes('480p')) {
          assert.fail(`wrong resolution: ${r.title}`)
        }
      }
    })
  })

  describe('Iruma-kun S4 ep10', () => {
    let results
    it('returns results', async () => {
      results = await Nyaa.single({
        anilistId: 131141,
        titles: ['Mairimashita! Iruma-kun 4'],
        episode: 10,
        episodeCount: 21,
        resolution: '1080',
        exclusions: [],
        fetch: (url) => fetch(url),
      })
      assert.ok(results.length > 0, 'should return results')
    })

    it('returns only ep 10', () => {
      for (const r of results) {
        const m = r.title.match(/[-\s](\d{1,3})\s|E(\d{1,3})|S\d+E(\d{1,3})/i)
        const ep = m ? (m[1] || m[2] || m[3]) : null
        if (ep) assert.strictEqual(Number(ep), 10, `wrong episode: ${r.title}`)
      }
    })

    it('includes Erai-raws', () => {
      assert.ok(results.some(r => r.title.includes('Erai-raws')), 'should include Erai-raws')
    })
  })
})
