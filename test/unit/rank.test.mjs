import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getInternals } from '../helpers/loader.mjs'

const { rankResults } = getInternals()

describe('rankResults', () => {
  it('ranks an explicit matching season above a seasonless result', () => {
    const results = rankResults(
      [
        { title: 'Show S4 - 10', seeders: 0 },
        { title: 'Show - 10', seeders: 0 },
      ],
      {},
      { mode: 'single', episode: 10, querySeason: 4, resultCache: new Map() },
      ['Show 4']
    )

    assert.strictEqual(results[0].title, 'Show S4 - 10')
  })
})
