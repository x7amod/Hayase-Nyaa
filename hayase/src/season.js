import {
  ROMAN_MAP,
  ROMAN_RE,
  RESULT_SEASON_RE,
  SEASON_ORDINAL_RE,
  SEASON_S_RE,
  TRAILING_EPISODE_RE,
  TRAILING_NUMBER_RE,
  TRAILING_ORDINAL_RE,
} from './constants.js'

export function detectQuerySeason(titles) {
  let maxSeason = null
  for (const title of titles) {
    const season = detectSeason(title)
    if (season != null) maxSeason = maxSeason == null ? season : Math.max(maxSeason, season)
  }
  return maxSeason
}

export function detectSeason(title) {
  return detectSeasonInternal(title, true)
}

export function detectSeasonInternal(title, allowTrailingBare) {
  const text = String(title)
  let match = SEASON_S_RE.exec(text)
  if (match) return Number(match[1])
  match = SEASON_ORDINAL_RE.exec(text)
  if (match) return Number(match[1])
  match = TRAILING_ORDINAL_RE.exec(text)
  if (match) return Number(match[1])
  ROMAN_RE.lastIndex = 0
  while ((match = ROMAN_RE.exec(text))) {
    const upper = match[1].toUpperCase()
    if (ROMAN_MAP[upper]) {
      const before = text.charCodeAt(match.index - 1)
      const afterIndex = match.index + match[1].length
      const after = text.charCodeAt(afterIndex)
      // A lone single-character numeral inside prose is usually a word.
      if (match[1].length === 1 && afterIndex < text.length) continue
      const beforeOk = match.index === 0 || (before >= 0x30 && before <= 0x39) || before === 0x20 || before === 0x5B || before === 0x28 || before === 0x2D
      const afterOk = afterIndex >= text.length || (after >= 0x30 && after <= 0x39) || after === 0x20 || after === 0x5D || after === 0x29 || after === 0x2E || after === 0x2C
      if (beforeOk && afterOk) return ROMAN_MAP[upper]
    }
  }
  if (allowTrailingBare) {
    match = TRAILING_NUMBER_RE.exec(text)
    if (match && !TRAILING_EPISODE_RE.test(text)) return Number(match[1])
  }
  return null
}

export function detectResultSeason(title) {
  const explicit = detectSeasonInternal(title, false)
  if (explicit != null) return explicit
  const match = RESULT_SEASON_RE.exec(String(title))
  if (match) {
    const candidate = Number(match[1])
    if (candidate >= 1 && candidate <= 99) return candidate
  }
  return null
}
