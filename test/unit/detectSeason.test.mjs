import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getInternals } from '../helpers/loader.mjs'

const { detectSeason, detectResultSeason } = getInternals()

describe('detectSeason', () => {
  describe('S notation', () => {
    it('detects S04', () => assert.strictEqual(detectSeason('Show S04 - 10'), 4))
    it('detects S4', () => assert.strictEqual(detectSeason('Show S4 - 10'), 4))
    it('detects Season 04', () => assert.strictEqual(detectSeason('Show Season 04 - 10'), 4))
    it('detects Season 4', () => assert.strictEqual(detectSeason('Show Season 4 - 10'), 4))
    it('detects s04 (lowercase)', () => assert.strictEqual(detectSeason('Show s04 - 10'), 4))
  })

  describe('ordinal notation', () => {
    it('detects 4th Season', () => assert.strictEqual(detectSeason('Show 4th Season - 10'), 4))
    it('detects 3rd Season', () => assert.strictEqual(detectSeason('Show 3rd Season - 10'), 3))
    it('detects 2nd Season', () => assert.strictEqual(detectSeason('Show 2nd Season - 10'), 2))
    it('detects 1st Season', () => assert.strictEqual(detectSeason('Show 1st Season - 10'), 1))
  })

  describe('roman numeral notation', () => {
    it('detects IV', () => assert.strictEqual(detectSeason('Show IV'), 4))
    it('detects III', () => assert.strictEqual(detectSeason('Show III'), 3))
    it('detects II', () => assert.strictEqual(detectSeason('Show II'), 2))
    it('detects trailing single V as season 5', () => assert.strictEqual(detectSeason('Show V'), 5))
    it('ignores the English pronoun I mid-title', () => {
      assert.strictEqual(detectSeason('I Became a Legend After My 10 Year-Long Last Stand'), null)
    })
    it('ignores a standalone I inside an English title', () => {
      assert.strictEqual(detectSeason('I Made Friends with the Second Prettiest Girl in My Class'), null)
    })
  })

  describe('trailing bare number', () => {
    it('detects trailing 4', () => assert.strictEqual(detectSeason('Mairimashita! Iruma-kun 4'), 4))
    it('detects trailing 3', () => assert.strictEqual(detectSeason('Show 3'), 3))
    it('rejects trailing number preceded by dash (episode slot)', () => {
      assert.strictEqual(detectSeason('[SubsPlease] Show - 12'), null)
    })
  })

  describe('result titles', () => {
    it('does not treat an undelimited trailing number as a result season', () => {
      assert.strictEqual(detectResultSeason('Movie 2'), null)
    })

    it('detects a bare season when an episode delimiter follows it', () => {
      assert.strictEqual(detectResultSeason('Show 4 - 14'), 4)
    })
  })
})
