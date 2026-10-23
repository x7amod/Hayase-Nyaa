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

  it('aborts active requests when the fetch budget expires', async () => {
    let signal
    const fetch = async (_url, options) => {
      signal = options.signal
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    }

    await fetchSearchPlan(fetch, 'https://nyaa.si/?q=', [{ term: 'slow' }], 20)
    assert.ok(signal?.aborted)
  })

  it('searches only romaji, english, and shorthand primary terms when they return results, and falls back only on 0 results', async () => {
    const requestedWithHits = []
    const rssHit = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[[Group] Romaji Name - 01 (1080p)]]></title><nyaa:seeders>10</nyaa:seeders><nyaa:infoHash>${'1'.repeat(40)}</nyaa:infoHash><nyaa:size>1.0 GiB</nyaa:size></item></channel></rss>`

    const results = await Nyaa.single({
      media: { title: { romaji: 'Romaji Name: Subtitle', english: 'English Name: Subtitle' }, synonyms: ['ShortAlias'] },
      titles: ['Romaji Name: Subtitle', 'English Name: Subtitle', 'ShortAlias'],
      episode: 1,
      resolution: '1080',
      exclusions: [],
      fetch: async (url) => {
        requestedWithHits.push(decodeURIComponent(url))
        return { ok: true, text: async () => rssHit }
      },
    })

    assert.strictEqual(results.length, 1)
    assert.ok(requestedWithHits.some(u => u.includes('Romaji Name: Subtitle')))
    assert.ok(requestedWithHits.some(u => u.includes('English Name: Subtitle')))
    assert.ok(requestedWithHits.some(u => u.includes('ShortAlias')))
    assert.ok(requestedWithHits.every(u => !u.includes('q=Romaji Name 1')), 'should not run stripped fallback variants when primary titles returned results')

    const requestedOnEmpty = []
    await Nyaa.single({
      media: { title: { romaji: 'Romaji Name: Subtitle', english: 'English Name: Subtitle' }, synonyms: ['ShortAlias'] },
      titles: ['Romaji Name: Subtitle', 'English Name: Subtitle', 'ShortAlias'],
      episode: 1,
      resolution: '1080',
      exclusions: [],
      fetch: async (url) => {
        requestedOnEmpty.push(decodeURIComponent(url))
        return { ok: true, text: async () => '<rss></rss>' }
      },
    })

    assert.ok(requestedOnEmpty.some(u => u.includes('q=Romaji Name 1')), 'should run stripped fallback variants when primary titles return 0 results')
  })
})
