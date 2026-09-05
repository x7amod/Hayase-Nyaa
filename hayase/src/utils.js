import { EPISODE_MARKER_RE, SEASON_MARKER_RE } from './constants.js'

export function normalizeSearch(title) {
  return String(title).normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export function ordinalSuffix(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  if (n % 10 === 1) return 'st'
  if (n % 10 === 2) return 'nd'
  if (n % 10 === 3) return 'rd'
  return 'th'
}

export function makeDedupCollector() {
  const seen = new Set()
  return (value, normalize = v => v) => {
    const normalized = normalize(value)
    if (!normalized) return null
    const key = normalized.toLowerCase()
    if (seen.has(key)) return null
    seen.add(key)
    return normalized
  }
}

export function makePlanCollector() {
  const seen = new Set()
  const plan = []
  const add = (term, sourceTitle) => {
    const key = String(term).toLowerCase()
    if (!term || seen.has(key)) return
    seen.add(key)
    plan.push({ term, sourceTitle })
  }
  return { plan, add }
}

export function preparedBase(base) {
  const stripped = stripQualifiers(base) || base
  const clean = stripped.replace(/[!?]+/g, '') || stripped
  return { stripped, clean, needsClean: clean !== stripped }
}

function stripQualifiers(title) {
  let stripped = String(title)
  while (true) {
    const next = removeBalancedGroups(stripped, '(', ')')
    if (next === stripped) break
    stripped = next
  }
  while (true) {
    const next = removeBalancedGroups(stripped, '[', ']')
    if (next === stripped) break
    stripped = next
  }
  const colon = topLevelColonIndex(stripped)
  return (colon >= 0 ? stripped.slice(0, colon) : stripped).replace(/\s+/g, ' ').trim()
}

function removeBalancedGroups(text, open, close) {
  const ranges = []
  const stack = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === open) stack.push(i)
    else if (text[i] === close && stack.length) {
      const start = stack.pop()
      if (!stack.length) ranges.push({ start, end: i + 1 })
    }
  }
  if (!ranges.length) return text
  let stripped = text
  for (let i = ranges.length - 1; i >= 0; i--) {
    const { start, end } = ranges[i]
    stripped = stripped.slice(0, start) + stripped.slice(end)
  }
  return stripped
}

function topLevelColonIndex(text) {
  let parentheses = 0
  let brackets = 0
  for (let i = text.length - 1; i >= 0; i--) {
    const char = text[i]
    if (char === ')') parentheses++
    else if (char === '(') parentheses--
    else if (char === ']') brackets++
    else if (char === '[') brackets--
    else if (char === ':' && parentheses === 0 && brackets === 0) return i
  }
  return -1
}

export function hasSeasonMarker(title) {
  return SEASON_MARKER_RE.test(title)
}

export function dropPunctuationDupes(titles) {
  const seen = new Set()
  return titles.filter(title => {
    const key = String(title).toLowerCase().replace(/[^a-z0-9]/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function isLatinSearchTitle(title) {
  return !/[^\u0000-\u024F\u1E00-\u1EFF\u2000-\u206F\u2190-\u21FF]/.test(String(title))
}

export function isShortAlias(title) {
  if (typeof title !== 'string') return false
  const text = title.trim()
  return text.length > 3 && text.length <= 16 && !/\s/.test(text) && isLatinSearchTitle(text)
}

export function hasEpisodeMarker(title) {
  return EPISODE_MARKER_RE.test(title)
}
