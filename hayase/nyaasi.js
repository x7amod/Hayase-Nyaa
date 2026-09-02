const MAX_CONCURRENT_SEARCHES = 2

// ── 0. Constants & shared regexes ──────────────────────────────────────────
const RESOLUTIONS = ['2160', '1080', '720', '540', '480']
const RESOLUTION_P_RE = new RegExp(`\\b(?:${RESOLUTIONS.join('|')})p\\b`, 'i')
const ANY_RESOLUTION_P_RE = /\b\d{3,4}p\b/i
const DIMENSION_RE = /\b\d{3,4}[xX]\d{3,4}\b/g
const K_RE = /\b\d+[kK]\b/
const BATCH_KEYWORD_RE = /\b(batch|complete|fin|全集)\b/i
const FIN_BRACKET_RE = /\[Fin\]/i
const SEASON_MARKER_RE = /\b(?:\d+(?:st|nd|rd|th)\s+[Ss]eason|[Ss]eason\s*0?\d|[Ss]0?\d)\b/
const EPISODE_MARKER_RE = /\b(?:S\d{1,2}E\d{1,4}|E[Pp]?\.?\s*\d{1,4})\b|[-–]\s*(?:E[Pp]?\.?\s*)?\d{1,4}\b/i
const BATCH_SEASON_RANGE_RE = /\b[Ss](?:eason)?\s*0?\d\b/
const RANGE_FRAGMENT_RE = /\b0*\d{1,4}\s*[-~]\s*0*\d{1,4}\b/
const ROMAN_RE = /\b(XXX?IX|XXX?IV|XXX?V?I{0,3}|XXI{0,3}|XIV|XIX|XL|XLIX|X{1,3}|IV|V|VI{0,3}|IX|I{1,3})\b/g
const SIZE_MULTIPLIERS = { KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KIB: 1024, MIB: 1048576, GIB: 1073741824, TIB: 1099511627776 }

const resolutionRegexCache = new Map()
const batchRangeRegexCache = new Map()

// ── 1. Small utils ─────────────────────────────────────────────────────────
function normalizeSearch(title) {
  return String(title).normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function ordinalSuffix(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  if (n % 10 === 1) return 'st'
  if (n % 10 === 2) return 'nd'
  if (n % 10 === 3) return 'rd'
  return 'th'
}

function makeDedupCollector() {
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

function makePlanCollector() {
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

function preparedBase(base) {
  const stripped = stripQualifiers(base) || base
  const clean = stripped.replace(/[!?]+/g, '') || stripped
  return { stripped, clean, needsClean: clean !== stripped }
}

function hasSeasonMarker(title) {
  return SEASON_MARKER_RE.test(title)
}

function hasEpisodeMarker(title) {
  // Reset is not needed for non-global regex, but keep helper single-source
  return EPISODE_MARKER_RE.test(title)
}

// ── NyaaSi class ───────────────────────────────────────────────────────────
export default new class NyaaSi {
  base = 'https://nyaa.si/?page=rss&c=1_2&q='

  single(query) {
    console.log('[NyaaSi] single()', { titles: query.titles, episode: query.episode, resolution: query.resolution, exclusions: query.exclusions, anilistId: query.anilistId })
    return this.search(query, { mode: 'single', episode: query.episode, resolution: query.resolution })
  }

  batch(query) {
    console.log('[NyaaSi] batch()', { titles: query.titles, episodeCount: query.episodeCount, resolution: query.resolution, exclusions: query.exclusions, anilistId: query.anilistId })
    console.log('[NyaaSi] media.status:', query.media?.status)
    if (query.media?.status === 'RELEASING') {
      console.log('[NyaaSi] skipping batch — show is still airing')
      return []
    }
    return this.search(query, { mode: 'batch', episodeCount: query.episodeCount })
  }

  movie(query) {
    console.log('[NyaaSi] movie()', { titles: query.titles, resolution: query.resolution, exclusions: query.exclusions, anilistId: query.anilistId })
    return this.search(query, { mode: 'movie' })
  }

  async search(query, searchContext) {
    try {
      const searchTitles = getSearchTitles(query)
      const searchPlan = buildSearchPlan(searchTitles, searchContext)
      if (!searchPlan.length) return []

      console.log('[NyaaSi] search plan:', searchPlan.map(e => e.term))

      const fetcher = query.fetch || fetch
      let results = []
      const queryTitles = searchPlan.map(entry => entry.sourceTitle)

      const outcomes = await fetchSearchPlan(fetcher, this.base, searchPlan)
      for (const outcome of outcomes) {
        if (outcome.status === 'fulfilled') {
          results = dedupeResults(results.concat(outcome.value.map(toTorrentResult)))
        }
      }

      console.log('[NyaaSi] raw results:', results.length)

      const filtered = results.filter(result => matchesQuery(result.title, query, searchContext, queryTitles))
      console.log('[NyaaSi] after filter:', filtered.length)

      const ranked = rankResults(filtered, query, searchContext, queryTitles)
      console.log('[NyaaSi] final results:', ranked.map(r => {
        const ep = r.title.match(/[-\s](\d{1,3})\s|E(\d{1,3})|S\d+E(\d{1,3})/i)
        const epNum = ep ? (ep[1] || ep[2] || ep[3]) : '??'
        return epNum + ' ' + r.title.slice(0, 70)
      }))
      return ranked
    } catch (e) {
      console.error('[NyaaSi] search error:', e)
      return []
    }
  }

  async test() {
    try {
      const res = await fetch(this.base + 'test')
      if (!res.ok) throw new Error(`Nyaa returned HTTP ${res.status}.`)
      return true
    } catch (error) {
      throw new Error(`Nyaa is unavailable: ${error.message}`)
    }
  }
}()

async function fetchSearchPlan(fetcher, base, searchPlan) {
  const outcomes = new Array(searchPlan.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < searchPlan.length) {
      const index = nextIndex++
      const { term } = searchPlan[index]
      try {
        outcomes[index] = {
          status: 'fulfilled',
          value: await fetchResults(fetcher, base, term),
        }
      } catch (reason) {
        outcomes[index] = { status: 'rejected', reason }
      }
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_SEARCHES, searchPlan.length)
  await Promise.all(Array.from({ length: workerCount }, worker))
  return outcomes
}

// ── Search plan ────────────────────────────────────────────────────────────
// Rules:
//   1. Base form of every supplied title is always searched — this already
//      covers plain title-only torrents like "Gosick 1080p BD".
//   2. Stripped variants (trailing (...) / [...]) are added.
//   3. Single mode: episode-qualified terms per title.
//   4. Single mode + season detected: S04 / Season 4 / 4th Season variants.
//   5. Batch mode: batch/complete/season + range variants. Plain title is
//      already covered by (1), range/season terms are supplemental.
function buildSearchPlan(titles = [], searchContext = {}) {
  const { plan, add } = makePlanCollector()

  const cleanTitles = (titles || [])
    .filter(title => typeof title === 'string' && title.trim())
    .map(normalizeSearch)
    .filter(Boolean)

  for (const base of cleanTitles) add(base, base)

  for (const base of cleanTitles) {
    for (const variant of buildSearchVariants(base)) add(variant, base)
  }

  if (searchContext.mode === 'single' && searchContext.episode != null) {
    const ep = searchContext.episode
    const padded = String(ep).padStart(2, '0')
    const res = searchContext.resolution

    for (const base of cleanTitles) {
      const { stripped, clean, needsClean } = preparedBase(base)
      add(`${stripped} ${ep}`, stripped)
      if (padded !== String(ep)) add(`${stripped} ${padded}`, stripped)
      if (res) add(`${stripped} ${ep} ${res}p`, stripped)
      if (needsClean) {
        add(`${clean} ${ep}`, clean)
        if (padded !== String(ep)) add(`${clean} ${padded}`, clean)
        if (res) add(`${clean} ${ep} ${res}p`, clean)
      }
    }

    const season = detectQuerySeason(cleanTitles)
    if (season) {
      const sfx = ordinalSuffix(season)
      for (const base of cleanTitles) {
        const { stripped, clean } = preparedBase(base)
        // Use clean base so Nyaa AND-search matches groups omitting !/?
        add(`${clean} S${String(season).padStart(2, '0')} ${searchContext.episode}`, clean)
        add(`${clean} Season ${season} ${searchContext.episode}`, clean)
        const ordinalBase = clean.replace(new RegExp(`\\s+0*${season}\\s*$`), '') || clean
        add(`${ordinalBase} ${season}${sfx} Season ${searchContext.episode}`, ordinalBase)
      }
    }
  }

  if (searchContext.mode === 'batch') {
    const epCount = searchContext.episodeCount
    const padded = epCount ? String(epCount).padStart(2, '0') : null
    for (const base of cleanTitles) {
      const { stripped, clean } = preparedBase(base)
      add(`${clean} batch`, clean)
      add(`${clean} complete`, clean)
      add(`${clean} season`, clean)
      if (epCount) {
        add(`${clean} 1-${epCount}`, clean)
        add(`${clean} 01-${padded}`, clean)
        add(`${clean} 01-${epCount}`, clean)
        add(`${clean} 1-${padded}`, clean)
        add(`${clean} 01 ~ ${padded}`, clean)
        add(`${clean} 1 ~ ${epCount}`, clean)
      }
    }
  }

  return plan
}

function getSearchTitles(query = {}) {
  const mediaTitles = query.media?.title ?? {}
  const collect = makeDedupCollector()
  const preferred = []
  const push = (title) => {
    const out = collect(title, normalizeSearch)
    if (out) preferred.push(out)
  }

  for (const title of [mediaTitles.romaji, mediaTitles.english]) {
    if (typeof title !== 'string' || !title.trim()) continue
    push(title)
    const ordinal = title.match(/(\d{1,2})(?:st|nd|rd|th) Season/i)
    const season = title.match(/Season (\d{1,2})/i)
    if (season) push(title.replace(/Season \d{1,2}/i, `S${season[1]}`))
    else if (ordinal) push(title.replace(/\d{1,2}(?:st|nd|rd|th) Season/i, `S${ordinal[1]}`))
  }

  if (preferred.length) return preferred
  return Array.isArray(query.titles) ? query.titles : []
}

function stripQualifiers(title) {
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

function buildSearchVariants(title) {
  const normalized = normalizeSearch(title)
  const collect = makeDedupCollector()
  const variants = []
  const push = (v) => {
    const out = collect(v, normalizeSearch)
    if (out) variants.push(out)
  }
  push(normalized)
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

async function fetchResults(fetcher, base, term) {
  const res = await fetcher(base + encodeURIComponent(term))
  if (!res.ok) return []
  const text = await res.text()
  return parseRssResults(text)
}

function toTorrentResult(item) {
  const tags = normalizeTags(item.tags || item.Tags)
  const parsedDate = item.DateUploaded ? new Date(item.DateUploaded) : null
  return {
    title: item.Name,
    link: item.Magnet,
    hash: item.hash || item.Magnet?.match(/btih:([A-Za-z0-9]+)/)?.[1] || '',
    seeders: Number(item.Seeders || 0),
    leechers: Number(item.Leechers || 0),
    downloads: Number(item.Downloads || 0),
    size: item.SizeBytes || 0,
    date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date(),
    accuracy: 'medium',
    tags,
    Tags: tags
  }
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean)
  if (typeof tags === 'string' && tags.trim()) return [tags.trim()]
  return []
}

function decodeXmlEntities(str) {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function parseRssResults(xml) {
  const items = String(xml).split('<item>').slice(1)
  return items.map(item => {
    const extract = (tag) => {
      const start = item.indexOf('<' + tag + '>')
      const end = item.indexOf('</' + tag + '>')
      return start >= 0 && end > start ? item.slice(start + tag.length + 2, end).trim() : ''
    }
    const hash = extract('nyaa:infoHash').trim()
    const rawTitle = extract('title').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim()
    const title = decodeXmlEntities(rawTitle)
    const sizeStr = extract('nyaa:size')
    const size = parseSize(sizeStr)
    const magnet = hash ? 'magnet:?xt=urn:btih:' + hash : ''
    const tags = extractTags(title, magnet)
    return {
      Name: title,
      Magnet: magnet,
      Seeders: extract('nyaa:seeders'),
      Leechers: extract('nyaa:leechers'),
      Downloads: extract('nyaa:downloads'),
      Size: sizeStr,
      SizeBytes: size,
      DateUploaded: extract('pubDate'),
      Tags: tags,
      tags
    }
  })
}

function parseSize(sizeStr) {
  if (!sizeStr) return 0
  const match = sizeStr.match(/([\d.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB)/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  return value * (SIZE_MULTIPLIERS[unit] || 0)
}

function extractTags(title, magnet = '') {
  const tags = []
  if (/\bmulti[\s-]?sub\b/i.test(title) || /\bmulti[\s-]?sub\b/i.test(decodeURIComponentSafe(magnet))) {
    tags.push('Multi Sub')
  }
  return tags
}

function decodeURIComponentSafe(value = '') {
  try { return decodeURIComponent(String(value)) } catch { return String(value) }
}

// ── Filtering ──────────────────────────────────────────────────────────────
function matchesQuery(title, query, searchContext, queryTitles) {
  if (hasExcludedKeyword(title, query?.exclusions)) return false
  const titles = Array.isArray(queryTitles) ? queryTitles : [queryTitles]
  if (query?.resolution && hasAnyResolution(title) && !matchesResolution(title, query.resolution)) return false
  if (searchContext.mode !== 'movie') {
    const querySeason = detectQuerySeason(titles)
    if (querySeason) {
      const resultSeason = detectResultSeason(title)
      if (resultSeason && resultSeason !== querySeason) return false
    }
  }
  if (searchContext.mode === 'single') {
    if (!isPlausibleEpisode(title, searchContext.episode)) return false
  }
  if (searchContext.mode === 'batch') {
    if (!matchesBatch(title, searchContext.episodeCount)) return false
  }
  return true
}

function detectQuerySeason(titles) {
  let maxSeason = null
  for (const t of titles) {
    const s = detectSeason(t)
    if (s != null) maxSeason = maxSeason == null ? s : Math.max(maxSeason, s)
  }
  return maxSeason
}

function isPlausibleEpisode(title, ep) {
  if (ep == null) return true
  return classifyEpisode(title, ep) === 'exact'
}

function hasExcludedKeyword(title, exclusions = []) {
  const lowered = title.toLowerCase()
  return exclusions.some(exclusion => {
    const ex = String(exclusion).toLowerCase().trim()
    if (!ex) return false
    return lowered.includes(ex)
  })
}

function matchesResolution(title, resolution) {
  if (!resolution) return true
  const res = String(resolution)
  // Dimension match first — height determines resolution, avoid bare-number false positive inside dimensions
  DIMENSION_RE.lastIndex = 0
  let m
  while ((m = DIMENSION_RE.exec(title))) {
    const h = m[0].split(/[xX]/)[1]
    if (h === res) return true
  }
  // Strip dimensions before testing bare resolution so "720x1080" does not count as "720p"
  const withoutDimensions = String(title).replace(DIMENSION_RE, ' ')
  const cacheKey = res
  let re = resolutionRegexCache.get(cacheKey)
  if (!re) {
    re = new RegExp(`(?:^|[^0-9])${res}p?(?:[^0-9]|$)`, 'i')
    resolutionRegexCache.set(cacheKey, re)
  }
  if (re.test(withoutDimensions)) return true
  return false
}

function hasAnyResolution(title) {
  if (ANY_RESOLUTION_P_RE.test(title)) return true
  DIMENSION_RE.lastIndex = 0
  if (DIMENSION_RE.test(title)) return true
  if (K_RE.test(title)) return true
  return false
}

function stripEpisodeNoise(title) {
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

const ROMAN_MAP = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10, XI:11, XII:12, XIII:13, XIV:14, XV:15, XVI:16, XVII:17, XVIII:18, XIX:19, XX:20, XXI:21, XXII:22, XXIII:23, XXIV:24, XXV:25, XXVI:26, XXVII:27, XXVIII:28, XXIX:29, XXX:30, XXXI:31, XXXII:32, XXXIII:33, XXXIV:34, XXXV:35, XXXVI:36, XXXVII:37, XXXVIII:38, XXXIX:39 }

function detectSeason(title) {
  return detectSeasonInternal(title, true)
}

function detectSeasonInternal(title, allowTrailingBare) {
  const text = String(title)
  let m = text.match(/\b[Ss](?:eason)?\s*0*(\d{1,2})\b/)
  if (m) return Number(m[1])
  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+[Ss]eason\b/)
  if (m) return Number(m[1])
  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)\b\s*$/)
  if (m) return Number(m[1])
  ROMAN_RE.lastIndex = 0
  while ((m = ROMAN_RE.exec(text))) {
    const upper = m[1].toUpperCase()
    if (ROMAN_MAP[upper]) {
      const before = text.charCodeAt(m.index - 1)
      const afterIdx = m.index + m[1].length
      const after = text.charCodeAt(afterIdx)
      const beforeOk = m.index === 0 || (before >= 0x30 && before <= 0x39) || before === 0x20 || before === 0x5B || before === 0x28 || before === 0x2D
      const afterOk = afterIdx >= text.length || (after >= 0x30 && after <= 0x39) || after === 0x20 || after === 0x5D || after === 0x29 || after === 0x2E || after === 0x2C
      if (beforeOk && afterOk) return ROMAN_MAP[upper]
    }
  }
  if (allowTrailingBare) {
    m = text.match(/(?:^|\s)0*(\d{1,2})\s*$/)
    if (m && !/[-–]\s*\d{1,2}\s*$/.test(text)) return Number(m[1])
  }
  return null
}

function detectResultSeason(title) {
  const explicit = detectSeasonInternal(title, false)
  if (explicit != null) return explicit
  const text = String(title)
  const m = text.match(/\b0*(\d{1,2})(?:\s*[-–]\s*(?:E|EP)?\s*\d|\s+E\d|\s+S\d{1,2}E\d)/i)
  if (m) {
    const candidate = Number(m[1])
    if (candidate >= 1 && candidate <= 99) return candidate
  }
  return null
}

function classifyEpisode(title, ep) {
  if (ep == null) return 'absent'
  const cleaned = stripEpisodeNoise(title)
  const epNum = Number(ep)
  // Any compact range in the title means this is a batch/multi-episode release, not a single
  const rangeRe = /\b0*(\d{1,4})(?:[-~]|to)0*(\d{1,4})(?=\D|$)/gi
  let rm
  const hasRange = (() => {
    rangeRe.lastIndex = 0
    while ((rm = rangeRe.exec(cleaned))) {
      const lo = Math.min(Number(rm[1]), Number(rm[2]))
      const hi = Math.max(Number(rm[1]), Number(rm[2]))
      // Range that includes or equals the requested episode -> definitely a range release
      if (epNum >= lo && epNum <= hi) return true
      // Any range at all -> treat as range for single-mode filtering (batch, not single)
      // This prevents "01-12" being considered exact for ep 1 or 12
      return true
    }
    return false
  })()
  if (hasRange) return 'range'
  const allNums = []
  let m
  const eRe = /\b(?:S\d{1,2})?[Ee][Pp]?\.?\s*0*(\d{1,4})\b/g
  while ((m = eRe.exec(cleaned))) allNums.push(Number(m[1]))
  const slotRe = /(?:^|[\s_\-])[\-]\s*0*(\d{1,4})(?=[\s_\-)\]\.,]|$)/g
  while ((m = slotRe.exec(cleaned))) allNums.push(Number(m[1]))
  const standaloneRe = /(?:^|[\s_\-])0*(\d{1,3})(?=[\s_)\]\.,]|$)/g
  while ((m = standaloneRe.exec(cleaned))) allNums.push(Number(m[1]))
  // Detect multi-episode titles like "10 & 11" or "10, 11" — multiple distinct episode numbers
  if (allNums.length > 1) {
    const distinct = [...new Set(allNums)]
    if (distinct.length > 1 && distinct.includes(epNum)) return 'range'
  }
  if (!allNums.length) return 'absent'
  if (allNums.includes(epNum)) return 'exact'
  return 'conflict'
}

function matchesBatch(title, episodeCount) {
  // Explicit single-episode notation is never a batch — reuse single's EPISODE_MARKER_RE
  // via hasEpisodeMarker, but allow range fragments (e.g. 01-21) which also contain a dash
  if (hasEpisodeMarker(title) && !RANGE_FRAGMENT_RE.test(title)) return false
  if (BATCH_KEYWORD_RE.test(title)) return true
  if (FIN_BRACKET_RE.test(title)) return true
  if (hasSeasonMarker(title) && !hasEpisodeMarker(title)) {
    // Season-only packs like "Show Season 3 [1080p]" are batches, but
    // "Show Season 3 01 [1080p]" is an individual episode with a bare number
    const probe = episodeCount ?? 1
    if (classifyEpisode(title, probe) === 'absent') return true
  }
  if (BATCH_SEASON_RANGE_RE.test(title) && RANGE_FRAGMENT_RE.test(title)) return true
  if (episodeCount) {
    const key = String(episodeCount)
    let cached = batchRangeRegexCache.get(key)
    if (!cached) {
      const padded = String(episodeCount).padStart(2, '0')
      const start = '(?:0?1|01)'
      const end = `(?:0?${episodeCount}|${padded})`
      cached = {
        range: new RegExp(`(?:^|[^0-9])(?:ep\\.?\\s*)?${start}\\s*(?:[-~]|to|x|/)\\s*${end}(?:[^0-9]|$)`, 'i'),
        of: new RegExp(`(?:^|[^0-9])${start}\\s*of\\s*${end}(?:[^0-9]|$)`, 'i')
      }
      batchRangeRegexCache.set(key, cached)
    }
    if (cached.range.test(title)) return true
    if (cached.of.test(title)) return true
  }
  if (episodeCount != null && classifyEpisode(title, episodeCount) === 'absent' && !hasEpisodeMarker(title)) return true
  if (episodeCount == null && !hasEpisodeMarker(title) && classifyEpisode(title, 1) === 'absent') return true
  return false
}

function dedupeResults(results) {
  const seen = new Set()
  return results.filter(result => {
    const key = (result.hash || result.link || result.title || '').toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function rankResults(results, query, searchContext, queryTitles) {
  return results
    .map(result => ({ ...result, _score: scoreResult(result, query, searchContext, queryTitles) }))
    .sort((a, b) => b._score - a._score || b.seeders - a.seeders)
    .map(({ _score, ...result }) => result)
}

function scoreResult(result, query, searchContext, queryTitles) {
  let score = 0
  const similarity = bestTitleSimilarity(queryTitles, result.title)
  if (similarity > 0.7) score += 40
  else if (similarity > 0.4) score += 12
  else score -= 15
  if (searchContext.mode === 'single' && searchContext.episode != null) {
    const verdict = classifyEpisode(result.title, searchContext.episode)
    if (verdict === 'exact') score += 30
    else if (verdict === 'conflict') score -= 30
    const rs = detectResultSeason(result.title)
    const qs = detectQuerySeason(Array.isArray(queryTitles) ? queryTitles : [queryTitles])
    if (rs && qs && rs === qs) score += 8
  }
  if (searchContext.mode === 'batch' && matchesBatch(result.title, searchContext.episodeCount)) score += 30
  if (matchesResolution(result.title, query?.resolution)) score += 15
  else if (query?.resolution && hasAnyResolution(result.title)) score -= 5
  if (/\b(batch|complete|season|s\d{1,2})\b/i.test(result.title)) score += searchContext.mode === 'batch' ? 10 : -10
  score += Math.min(result.seeders || 0, 100) / 10
  return score
}

function bestMatchingQueryTitle(queryTitles, resultTitle) {
  const titles = Array.isArray(queryTitles) ? queryTitles : [queryTitles]
  let bestTitle = titles[0] || ''
  let bestScore = -1
  for (const title of titles) {
    const score = titleSimilarity(title, resultTitle)
    if (score > bestScore) { bestScore = score; bestTitle = title }
  }
  return bestTitle
}

function bestTitleSimilarity(queryTitles, resultTitle) {
  const titles = Array.isArray(queryTitles) ? queryTitles : [queryTitles]
  let best = 0
  for (const title of titles) best = Math.max(best, titleSimilarity(title, resultTitle))
  return best
}

function titleSimilarity(queryTitle, resultTitle) {
  const queryWords = wordSet(queryTitle)
  const resultWords = wordSet(resultTitle)
  if (!queryWords.size) return 0
  let matches = 0
  for (const word of queryWords) if (resultWords.has(word)) matches++
  return matches / queryWords.size
}

function wordSet(value) {
  return new Set(String(value).toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(word => word.length > 1))
}
