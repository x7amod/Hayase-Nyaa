import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getInternals } from '../helpers/loader.mjs'

const { classifyEpisode } = getInternals()

describe('classifyEpisode', () => {
  describe('exact matches', () => {
    it('returns exact for SxxExx format', () => {
      assert.strictEqual(classifyEpisode('[SubsPlease] Show - S01E12 (1080p)', 12), 'exact')
    })

    it('returns exact for dash-separated episode', () => {
      assert.strictEqual(classifyEpisode('[SubsPlease] Sousou no Frieren - 12 (1080p) [A0234FCE].mkv', 12), 'exact')
    })

    it('returns exact for dash-separated episode without trailing metadata', () => {
      assert.strictEqual(classifyEpisode('Show - 02', 2), 'exact')
    })

    it('does not treat a season number as the episode', () => {
      assert.strictEqual(classifyEpisode('Show 4 - 14', 14), 'exact')
      assert.strictEqual(classifyEpisode('Show 4 - 14', 4), 'conflict')
    })

    it('returns exact for large episode numbers', () => {
      assert.strictEqual(classifyEpisode('[SubsPlease] One Piece - 1100 (1080p)', 1100), 'exact')
    })

    it('returns exact for zero-padded episode', () => {
      assert.strictEqual(classifyEpisode('[SubsPlease] Bocchi the Rock! - 04 (1080p)', 4), 'exact')
    })

    it('returns exact for Erai-raws format', () => {
      assert.strictEqual(classifyEpisode('[Erai-raws] One Piece - 1100 [1080p][HEVC]', 1100), 'exact')
    })

    it('returns exact for Erai-raws 4th Season format', () => {
      assert.strictEqual(classifyEpisode('[Erai-raws] Mairimashita Iruma-kun 4th Season - 10 [1080p CR WEBRip HEVC AAC]', 10), 'exact')
    })
  })

  describe('conflict (wrong episode)', () => {
    it('returns conflict when episode does not match', () => {
      assert.strictEqual(classifyEpisode('[SubsPlease] Show - 12 (1080p)', 10), 'conflict')
    })

    it('returns conflict for SxxExx with different ep', () => {
      assert.strictEqual(classifyEpisode('[SubsPlease] Show - S04E16 (1080p)', 10), 'conflict')
    })
  })

  describe('range (batch releases)', () => {
    it('returns range for episode inside compact range', () => {
      assert.strictEqual(classifyEpisode('[SubsPlease] Show S2 (01-10) (1080p)', 5), 'range')
    })

    it('returns conflict for tilde range with spaces (Nyaa treats ~ as separator)', () => {
      // rangeRe only matches compact ranges (no spaces around separator)
      assert.strictEqual(classifyEpisode('[Erai-raws] Show - 01 ~ 21 [1080p]', 10), 'conflict')
    })

    it('returns exact for episode at range endpoint', () => {
      assert.strictEqual(classifyEpisode('[SubsPlease] Show S2 (01-10) (1080p)', 1), 'exact')
    })
  })

  describe('absent (no episode number)', () => {
    it('returns absent when no episode number found', () => {
      assert.strictEqual(classifyEpisode('[SubsPlease] Show (1080p) [Batch]', 5), 'absent')
    })

    it('returns absent for batch-only titles', () => {
      assert.strictEqual(classifyEpisode('[Judas] Show (Season 3) [1080p] (Batch)', 10), 'absent')
    })
  })

  describe('edge cases', () => {
    it('handles null/undefined episode', () => {
      assert.strictEqual(classifyEpisode('[SubsPlease] Show - 12', null), 'absent')
      assert.strictEqual(classifyEpisode('[SubsPlease] Show - 12', undefined), 'absent')
    })

    it('handles empty title', () => {
      assert.strictEqual(classifyEpisode('', 1), 'absent')
    })
  })
})
