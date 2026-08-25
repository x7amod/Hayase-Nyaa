import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getInternals } from '../helpers/loader.mjs'

const { toTorrentResult } = getInternals()

describe('toTorrentResult', () => {
  it('falls back to a valid date when pubDate is invalid', () => {
    const result = toTorrentResult({ Name: 'Show - 01', DateUploaded: 'not-a-date' })
    assert.ok(result.date instanceof Date)
    assert.ok(!Number.isNaN(result.date.getTime()))
  })

  it('falls back to a valid date when pubDate is missing', () => {
    const result = toTorrentResult({ Name: 'Show - 01' })
    assert.ok(!Number.isNaN(result.date.getTime()))
  })
})
