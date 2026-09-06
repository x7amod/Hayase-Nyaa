import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getExtension, getInternals } from '../helpers/loader.mjs'

const Nyaa = getExtension()
const { fetchSearchPlan } = getInternals()

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
      titles: ['Show (Dub) [1080p]', 'Show Alternate'],
      episode: 1,
      resolution: '1080',
      exclusions: [],
      fetch,
    })

    assert.strictEqual(maxActive, 2, `expected two concurrent requests, observed ${maxActive}`)
  })

  it('returns fulfilled terms when the fetch budget expires', async () => {
    const rss = (title) => `<?xml version="1.0"?><rss><channel><item><title><![CDATA[${title}]]></title><nyaa:seeders>5</nyaa:seeders><nyaa:infoHash>${'b'.repeat(40)}</nyaa:infoHash><nyaa:size>1.4 GiB</nyaa:size></item></channel></rss>`
    const fetch = async (url) => {
      // A stalled source that never answers: a pending promise with no
      // timer holds no event-loop handles, so the suite stays fast.
      if (url.includes('slow')) await new Promise(() => {})
      return { ok: true, text: async () => rss('[Group] Show - 01 (1080p)') }
    }
    const outcomes = await fetchSearchPlan(
      fetch, 'https://nyaa.si/?page=rss&c=1_2&q=',
      [{ term: 'fast', sourceTitle: 'Show' }, { term: 'slow', sourceTitle: 'Show' }],
      200
    )
    assert.strictEqual(outcomes[0]?.status, 'fulfilled')
    assert.strictEqual(outcomes[1], undefined, 'unstarted terms stay empty instead of hanging')
  })
})
