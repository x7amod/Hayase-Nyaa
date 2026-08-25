import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getExtension } from '../helpers/loader.mjs'

const Nyaa = getExtension()

describe('search request scheduling', () => {
  it('runs independent search terms concurrently', async () => {
    let active = 0
    let maxActive = 0

    const fetch = async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 25))
      active--
      return { ok: true, text: async () => '<rss></rss>' }
    }

    await Nyaa.single({
      titles: ['Show (Dub) [1080p]'],
      episode: 1,
      resolution: '1080',
      exclusions: [],
      fetch,
    })

    assert.strictEqual(maxActive, 2, `expected two concurrent requests, observed ${maxActive}`)
  })
})
