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

export function stripEpisodeNoise(title) {
  return String(title)
    .replace(/\b\d{3,4}p\b/gi, ' ')
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

export function classifyEpisode(title, episode) {
  if (episode == null) return 'absent'
  const cleaned = stripEpisodeNoise(title)
  const episodeNumber = Number(episode)
  let match
  const hasRange = (() => {
    CLASSIFY_RANGE_RE.lastIndex = 0
    while ((match = CLASSIFY_RANGE_RE.exec(cleaned))) {
      const low = Math.min(Number(match[1]), Number(match[2]))
      const high = Math.max(Number(match[1]), Number(match[2]))
      if (episodeNumber >= low && episodeNumber <= high) return true
      return true
    }
    return false
  })()
  if (hasRange) return 'range'

  const allNumbers = []
  CLASSIFY_EP_RE.lastIndex = 0
  while ((match = CLASSIFY_EP_RE.exec(cleaned))) allNumbers.push(Number(match[1]))
  CLASSIFY_SLOT_RE.lastIndex = 0
  while ((match = CLASSIFY_SLOT_RE.exec(cleaned))) allNumbers.push(Number(match[1]))
  CLASSIFY_STANDALONE_RE.lastIndex = 0
  while ((match = CLASSIFY_STANDALONE_RE.exec(cleaned))) {
    const numberEnd = CLASSIFY_STANDALONE_RE.lastIndex
    let next = numberEnd
    while (next < cleaned.length && /\s/.test(cleaned[next])) next++
    const nextChar = cleaned[next]
    if (nextChar && /[A-Za-z]/.test(nextChar)) continue
    allNumbers.push(Number(match[1]))
  }
  if (allNumbers.length > 1) {
    const distinct = [...new Set(allNumbers)]
    if (distinct.length > 1 && distinct.includes(episodeNumber)) return 'range'
  }
  if (!allNumbers.length) return 'absent'
  if (allNumbers.includes(episodeNumber)) return 'exact'
  return 'conflict'
}
