import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getExtension } from '../helpers/loader.mjs'

const Nyaa = getExtension()
const SKIP = process.env.CI === 'true'

const KNOWN_GROUPS = ['SubsPlease', 'Erai-raws', 'Judas', 'ASW', 'DKB']

describe('nyaa-scenegroups', { skip: SKIP }, () => {
  for (const [show, titles, ep] of [
    ['Frieren S2 ep12', ['Sousou no Frieren'], 12],
    ['One Piece ep1100', ['One Piece'], 1100],
    ['Bocchi ep4', ['Bocchi the Rock!'], 4],
    ['Iruma-kun S4 ep10', ['Mairimashita! Iruma-kun 4'], 10],
  ]) {
    describe(show, () => {
      let results
      it('returns results', async () => {
        results = await Nyaa.single({
          titles,
          episode: ep,
          resolution: '1080',
          exclusions: [],
          fetch: (url) => fetch(url),
        })
        assert.ok(results.length > 0, 'should return results')
      })

      it('includes known scene groups', () => {
        const groups = new Set()
        for (const r of results) {
          const m = r.title.match(/^\[([^\]]+)\]/)
          if (m) groups.add(m[1])
        }
        const found = KNOWN_GROUPS.filter(g => groups.has(g))
        assert.ok(found.length > 0, `no known groups found in ${results.length} results`)
      })
    })
  }
})
