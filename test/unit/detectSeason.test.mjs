import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getInternals } from '../helpers/loader.mjs'

const { detectSeason } = getInternals()

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
  })

  describe('trailing bare number', () => {
    it('detects trailing 4', () => assert.strictEqual(detectSeason('Mairimashita! Iruma-kun 4'), 4))
    it('detects trailing 3', () => assert.strictEqual(detectSeason('Show 3'), 3))
    it('detects trailing episode number as season (by design)', () => {
      // detectSeason treats trailing bare numbers as season, even if they're episode numbers
      assert.strictEqual(detectSeason('[SubsPlease] Show - 12'), 12)
    })
  })
})
