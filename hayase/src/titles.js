import { ROMAN_MAP } from './constants.js'
import {
  dropPunctuationDupes,
  isLatinSearchTitle,
  isShortAlias,
  makeDedupCollector,
  normalizeSearch,
  ordinalSuffix,
} from './utils.js'

export function getSearchTitles(query = {}) {
  const mediaTitles = query.media?.title ?? {}
  const collect = makeDedupCollector()
  const preferred = []
  let hasExplicitTitle = false
  const push = (title) => {
    const out = collect(title, normalizeSearch)
    if (out) preferred.push(out)
  }

  for (const title of [mediaTitles.romaji, mediaTitles.english]) {
    if (typeof title !== 'string' || !title.trim()) continue
    hasExplicitTitle = true
    push(title)
    const ordinal = title.match(/(\d{1,2})(?:st|nd|rd|th) Season/i)
    const season = title.match(/Season (\d{1,2})/i)
    if (season) push(title.replace(/Season \d{1,2}/i, `S${season[1]}`))
    else if (ordinal) push(title.replace(/\d{1,2}(?:st|nd|rd|th) Season/i, `S${ordinal[1]}`))
  }

  // Full synonyms and the rest of query.titles multiply the plan. Keep only
  // short single-token aliases release groups use as shorthand titles.
  const synonyms = Array.isArray(query.media?.synonyms) ? query.media.synonyms : []
  for (const title of synonyms) {
    if (!isShortAlias(title)) continue
    if (title === mediaTitles.romaji || title === mediaTitles.english) continue
    push(title)
  }

  if (hasExplicitTitle) return dropPunctuationDupes(preferred)
  const fallback = (Array.isArray(query.titles) ? query.titles : [])
    .filter(title => typeof title === 'string' && isLatinSearchTitle(title))
    .slice(0, 3)
  const latinFallback = dropPunctuationDupes(fallback)
  return latinFallback.length ? latinFallback : (Array.isArray(query.titles) ? query.titles.slice(0, 3) : [])
}

export function stripQualifiers(title) {
  let stripped = removeBalancedGroups(String(title), '(', ')')
  stripped = removeBalancedGroups(stripped, '[', ']')
  const colon = topLevelColonIndex(stripped)
  return (colon >= 0 ? stripped.slice(0, colon) : stripped)
    .replace(/\s+/g, ' ')
    .trim()
}

function scanBalanced(text, open, close) {
  const stack = []
  const ranges = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === open) stack.push(i)
    else if (text[i] === close && stack.length) {
      const start = stack.pop()
      if (!stack.length) ranges.push({ start, end: i + 1 })
    }
  }
  return ranges
}

function removeBalancedGroups(text, open, close) {
  const ranges = scanBalanced(text, open, close)
  if (!ranges.length) return text
  let stripped = text
  for (let i = ranges.length - 1; i >= 0; i--) {
    const { start, end } = ranges[i]
    stripped = stripped.slice(0, start) + stripped.slice(end)
  }
  return stripped
}

export function buildSearchVariants(title) {
  const normalized = normalizeSearch(title)
  const collect = makeDedupCollector()
  const variants = []
  const push = (value) => {
    const out = collect(value, normalizeSearch)
    if (out) variants.push(out)
  }
  push(normalized)
  for (const stripped of stripTrailingQualifierVariants(normalized)) push(stripped)
  for (const short of shortTitleVariants(normalized)) push(short)
  for (let i = 0; i < variants.length; i++) {
    const current = variants[i]
    for (const stripped of stripTrailingQualifierVariants(current)) push(stripped)
    push(current.replace(/[!?]/g, '').replace(/\s+/g, ' ').trim())
  }
  return variants
}

function stripTrailingQualifierVariants(title) {
  const text = String(title).trim()
  const variants = []
  for (const { start, end } of trailingQualifierRanges(text)) {
    variants.push(text.slice(0, start) + text.slice(end))
  }
  const colon = topLevelColonIndex(text)
  if (colon >= 0) variants.push(text.slice(0, colon))
  return variants
}

export function stripTrailingSeasonMarker(title, season) {
  const text = String(title).trim()
  const suffix = ordinalSuffix(season)
  const patterns = [
    new RegExp(`\\s+[Ss]0*${season}$`),
    new RegExp(`\\s+[Ss]eason\\s+0*${season}$`),
    new RegExp(`\\s+0*${season}${suffix}\\s+[Ss]eason$`, 'i'),
    new RegExp(`\\s+0*${season}$`),
  ]
  for (const pattern of patterns) {
    const out = text.replace(pattern, '').trim()
    if (out && out !== text) return out
  }
  const numerals = Object.keys(ROMAN_MAP)
    .filter(roman => ROMAN_MAP[roman] === season)
    .sort((a, b) => b.length - a.length)
  if (numerals.length) {
    const out = text.replace(new RegExp(`\\s+(?:${numerals.join('|')})[.!?]*$`), '').trim()
    if (out) return out
  }
  return text
}

function shortTitleVariants(title) {
  const text = String(title).trim()
  const variants = []
  const parenRe = /(\S+)\s*\(([^()]*)\)/g
  let match
  while ((match = parenRe.exec(text))) {
    const previous = match[1].replace(/^[([{\'"‘“]+/, '')
    if (/^[A-Z\u00C0-\u024F]/.test(previous) && previous.length > 1) {
      const phrase = `${previous} (${match[2].trim()})`
      if (phrase.length < text.length) variants.push(phrase)
    }
  }

  const cut = Math.max(topLevelCommaIndex(text), topLevelColonIndex(text))
  if (cut >= 0) {
    const words = text.slice(cut + 1).trim().split(/\s+/)
    let best = []
    let current = []
    const flush = () => { if (current.length > best.length) best = current; current = [] }
    for (const word of words) {
      if (/^[A-Z\u00C0-\u024F]/.test(word) && !/[?!,;:.]$/.test(word) && !/^[([{\'"‘“]/.test(word)) current.push(word)
      else flush()
    }
    flush()
    if (best.length >= 3) {
      const run = best.join(' ')
      if (run.length < text.length) variants.push(run)
    }
  }
  return variants
}

function topLevelCommaIndex(text) {
  let parentheses = 0
  let brackets = 0
  for (let i = text.length - 1; i >= 0; i--) {
    const char = text[i]
    if (char === ')') parentheses++
    else if (char === '(') parentheses--
    else if (char === ']') brackets++
    else if (char === '[') brackets--
    else if (char === ',' && parentheses === 0 && brackets === 0) return i
  }
  return -1
}

function trailingQualifierRanges(text) {
  const ranges = []
  let end = text.length
  while (end > 0) {
    while (end > 0 && /\s/.test(text[end - 1])) end--
    const close = text[end - 1]
    const open = close === ')' ? '(' : close === ']' ? '[' : null
    if (!open) break
    let depth = 0
    let start = -1
    for (let i = end - 1; i >= 0; i--) {
      if (text[i] === close) depth++
      else if (text[i] === open && --depth === 0) { start = i; break }
    }
    if (start < 0) break
    ranges.unshift({ start, end })
    end = start
  }
  return ranges
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
