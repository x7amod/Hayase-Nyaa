import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getExtension } from '../helpers/loader.mjs'

const Nyaa = getExtension()
const SKIP = process.env.CI === 'true'

describe('nyaa-batch', { skip: SKIP }, () => {
  describe('Iruma-kun S3 batch', () => {
    let results
    it('returns results', async () => {
      results = await Nyaa.batch({
        anilistId: 131141,
        titles: ['Mairimashita! Iruma-kun 3'],
        episodeCount: 21,
        resolution: '1080',
        exclusions: [],
        fetch: (url) => fetch(url),
      })
      assert.ok(results.length > 0, 'should return results')
    })

    it('includes batch releases', () => {
      const batchKeywords = /\b(batch|complete|01-\d+|1-\d+)\b/i
      const batchResults = results.filter(r => batchKeywords.test(r.title))
      assert.ok(batchResults.length > 0, 'should include batch releases')
    })

    it('filters to 1080p only', () => {
      for (const r of results) {
        if (r.title.includes('720p') || r.title.includes('480p')) {
          assert.fail(`wrong resolution: ${r.title}`)
        }
      }
    })
  })
})
