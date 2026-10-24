import {
  CLASSIFY_EP_RE,
  CLASSIFY_RANGE_RE,
  CLASSIFY_SLOT_RE,
  CLASSIFY_STANDALONE_RE,
} from './constants.js'

export function isPlausibleEpisode(title, episode) {
  if (episode == null) return true
  return classifyEpisode(title, episode) === 'exact'
}

export function classifyEpisodes(title, episodes = []) {
  const valid = episodes.filter(episode => episode != null).map(Number)
  if (!valid.length) return 'absent'
  const parsed = extractEpisodeNumbers(title)
  if (parsed.hasRange) return 'range'
  if (!parsed.numbers.length) return 'absent'
  if (parsed.distinctCount > 1 && valid.some(ep => parsed.numbers.includes(ep))) return 'range'
  if (valid.some(ep => parsed.numbers.includes(ep))) return 'exact'
  return 'conflict'
}

export function stripEpisodeNoise(title) {
  return String(title)
    .replace(/\b\d{3,4}p\d*\b/gi, ' ')
    .replace(/\b\d{1,5}\s*[xX]\s*\d{1,5}\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:KiB|MiB|GiB|TiB|KB|MB|GB)\b/gi, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\[[0-9A-Fa-f]{8,}\]/g, ' ')
    .replace(/\b0*(\d{1,4})\s*[Vv]\d{1,2}\b/g, ' $1 ')
    .replace(/\b[Ss](?:eason)?\s*\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\s+[Ss]eason\b/gi, ' ')
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\b\s*(?=$)/gi, ' ')
    .replace(/\b(XXX?IX|XXX?IV|XXX?V?I{0,3}|XXI{0,3}|XIV|XIX|XL|XLIX|X{1,3}|IV|V|VI{0,3}|IX|I{1,3})\b\s*$/gi, ' ')
    .replace(/(?:^|\s)0*(\d{1,2})\s*$/, (match, _number, offset, source) => {
      return /[-–]\s*$/.test(source.slice(0, offset)) ? match : ' '
    })
    .replace(/\b0*(\d{1,2})\s+[-–]\s+(?=(?:E|EP)?\s*0*\d{1,4}\b)/gi, ' ')
}

function extractEpisodeNumbers(title) {
  const cleaned = stripEpisodeNoise(title)
  CLASSIFY_RANGE_RE.lastIndex = 0
  if (CLASSIFY_RANGE_RE.test(cleaned)) return { hasRange: true, numbers: [], distinctCount: 0 }

  const numbers = []
  let match
  CLASSIFY_EP_RE.lastIndex = 0
  while ((match = CLASSIFY_EP_RE.exec(cleaned))) numbers.push(Number(match[1]))
  CLASSIFY_SLOT_RE.lastIndex = 0
  while ((match = CLASSIFY_SLOT_RE.exec(cleaned))) numbers.push(Number(match[1]))
  CLASSIFY_STANDALONE_RE.lastIndex = 0
  while ((match = CLASSIFY_STANDALONE_RE.exec(cleaned))) {
    let next = CLASSIFY_STANDALONE_RE.lastIndex
    while (next < cleaned.length && /\s/.test(cleaned[next])) next++
    const nextChar = cleaned[next]
    if (nextChar && /[A-Za-z]/.test(nextChar)) continue
    numbers.push(Number(match[1]))
  }
  const distinctCount = numbers.length > 1 ? new Set(numbers).size : numbers.length
  return { hasRange: false, numbers, distinctCount }
}

export function classifyEpisode(title, episode) {
  if (episode == null) return 'absent'
  return classifyEpisodes(title, [episode])
}
