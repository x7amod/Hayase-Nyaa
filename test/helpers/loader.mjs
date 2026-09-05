import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')

const INTERNAL_FUNCTIONS = [
  'classifyEpisode', 'detectSeason', 'detectResultSeason', 'detectQuerySeason',
  'matchesBatch', 'matchesQuery', 'isPlausibleEpisode',
  'buildSearchPlan', 'buildSearchVariants',
  'fetchSearchPlan', 'fetchResults',
  'getSearchTitles',
  'stripEpisodeNoise', 'normalizeSearch', 'stripQualifiers',
  'hasExcludedKeyword', 'hasAnyResolution', 'matchesResolution',
  'rankResults', 'scoreResult', 'dedupeResults',
  'parseRssResults', 'toTorrentResult', 'parseSize', 'extractTags',
  'bestTitleSimilarity', 'bestMatchingQueryTitle',
]

export function loadExtension(file = path.join(ROOT, 'hayase', 'nyaasi.js')) {
  const src = fs.readFileSync(file, 'utf8')
  const modified = src.replace('export default new class NyaaSi {', 'const __NyaaSi = new class NyaaSi {')
  const exportsList = INTERNAL_FUNCTIONS.join(', ')
  const wrapper = `${modified}\nreturn { NyaaSi: __NyaaSi, ${exportsList} }`
  const fn = new Function('module', 'fetch', wrapper)
  return fn({ exports: {} }, globalThis.fetch)
}

export function getExtension(file) {
  return loadExtension(file).NyaaSi
}

export function getInternals(file) {
  const { NyaaSi, ...internals } = loadExtension(file)
  return internals
}
