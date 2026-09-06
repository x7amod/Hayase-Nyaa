import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getInternals } from '../helpers/loader.mjs'

const { decodeXmlEntities, parseRssResults, parseSize, toTorrentResult } = getInternals()

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

describe('RSS parsing', () => {
  it('decodes astral numeric entities correctly', () => {
    assert.strictEqual(decodeXmlEntities('&#x1F600;'), '😀')
  })

  it('parses byte sizes and prefers the RSS byte count', () => {
    assert.strictEqual(parseSize('123 B'), 123)
    const results = parseRssResults('<rss><item><title>Show</title><nyaa:size>1 MiB</nyaa:size><nyaa:sizeBytes>123</nyaa:sizeBytes></item></rss>')
    assert.strictEqual(results[0].SizeBytes, 123)
  })
})
