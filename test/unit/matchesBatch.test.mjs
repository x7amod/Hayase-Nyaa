import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getInternals } from '../helpers/loader.mjs'
import { BATCH_TITLES } from '../fixtures/titles.mjs'

const { matchesBatch } = getInternals()

describe('matchesBatch', () => {
  describe('batch keyword', () => {
    for (const title of BATCH_TITLES.withBatch) {
      it(`detects batch keyword: ${title.slice(0, 70)}`, () => {
        assert.strictEqual(matchesBatch(title, 21), true)
      })
    }
  })

  describe('range patterns', () => {
    for (const title of BATCH_TITLES.withRange) {
      it(`detects range: ${title.slice(0, 70)}`, () => {
        assert.strictEqual(matchesBatch(title, 21), true)
      })
    }

    it('accepts en-dash ranges even when a batch keyword is present', () => {
      assert.strictEqual(matchesBatch('Show 01–21 [Batch]', 21), true)
    })
  })

  describe('complete keyword', () => {
    for (const title of BATCH_TITLES.withComplete) {
      it(`detects complete: ${title.slice(0, 70)}`, () => {
        assert.strictEqual(matchesBatch(title, 21), true)
      })
    }
  })

  describe('individual episodes', () => {
    it('rejects individual: [SubsPlease] ... - 21 (1080p)', () => {
      assert.strictEqual(matchesBatch('[SubsPlease] Mairimashita! Iruma-kun S3 - 21 (1080p) [FE27ABFE].mkv', 21), false)
    })
    it('rejects season notation on an individual episode', () => {
      assert.strictEqual(matchesBatch('[Erai-raws] Mairimashita! Iruma-kun 3rd Season - 21 END [1080p][Multiple Subtitle]', 21), false)
    })
  })

  describe('season-only titles', () => {
    it('accepts a season title without an episode marker', () => {
      assert.strictEqual(matchesBatch('Show Season 3 [1080p]', 12), true)
    })

    it('rejects S1 episode notation without batch evidence', () => {
      assert.strictEqual(matchesBatch('Show S1 - 01 [1080p]', 12), false)
    })
  })

  describe('episodeCount matching', () => {
    it('matches 1-21 when episodeCount is 21', () => {
      assert.strictEqual(matchesBatch('Show 1-21 [1080p]', 21), true)
    })

    it('matches 01-21 when episodeCount is 21', () => {
      assert.strictEqual(matchesBatch('Show [01-21] [1080p]', 21), true)
    })

    it('does not match 1-12 when episodeCount is 21', () => {
      assert.strictEqual(matchesBatch('Show 1-12 [1080p]', 21), false)
    })
  })
})
