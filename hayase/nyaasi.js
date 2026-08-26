const MAX_CONCURRENT_SEARCHES = 2

export default new class NyaaSi {
  base = 'https://nyaa.si/?page=rss&c=1_0&q='

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

      // Search terms are independent, but Nyaa throttles unbounded bursts.
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

// Build the list of Nyaa queries to run.
//
// Rules:
//   1. The base form of EVERY supplied title is always searched, so romaji
//      and English are both fetched every time (English is NOT a fallback).
//   2. Then stripped variants (trailing (...) / [...]) are added.
//   3. In single mode, an episode-qualified term ("<title> <ep>") is added
//      per title. Long-running shows scroll older episodes out of the
//      title-only RSS feed, so the episode number must be part of the query
//      for those episodes to surface at all.
function buildSearchPlan(titles = [], searchContext = {}) {
  const seen = new Set()
  const plan = []
  const add = (term, sourceTitle) => {
    const key = term.toLowerCase()
    if (!term || seen.has(key)) return
    seen.add(key)
    plan.push({ term, sourceTitle })
  }

  const cleanTitles = (titles || [])
    .filter(title => typeof title === 'string' && title.trim())
    .map(normalizeSearch)
    .filter(Boolean)

  // (1) base form of every title — both romaji and English always searched
  for (const base of cleanTitles) add(base, base)

  // (2) stripped variants
  for (const base of cleanTitles) {
    for (const variant of buildSearchVariants(base)) add(variant, base)
  }

  // (3) episode-qualified terms for single-episode lookups
  if (searchContext.mode === 'single' && searchContext.episode) {
    const ep = searchContext.episode
    const padded = String(ep).padStart(2, '0')
    const res = searchContext.resolution
    for (const base of cleanTitles) {
      const stripped = stripQualifiers(base) || base
      add(`${stripped} ${ep}`, stripped)
      if (padded !== String(ep)) add(`${stripped} ${padded}`, stripped)
      if (res) add(`${stripped} ${ep} ${res}p`, stripped)
      // Also add !/?-stripped variant for scene groups that omit punctuation
      const cleanBase = stripped.replace(/[!?]+/g, '') || stripped
      if (cleanBase !== stripped) {
        add(`${cleanBase} ${ep}`, cleanBase)
        if (padded !== String(ep)) add(`${cleanBase} ${padded}`, cleanBase)
        if (res) add(`${cleanBase} ${ep} ${res}p`, cleanBase)
      }
    }
  }

  // (4) season-qualified terms — when a season is detected, also search with
  //     explicit season markers (S04, Season 4, 4th Season) so scene groups
  //     that use different season notation are not missed.
  if (searchContext.mode === 'single' && searchContext.episode) {
    const season = detectQuerySeason(cleanTitles)
    if (season) {
      const sfx = season % 100 >= 11 && season % 100 <= 13 ? 'th'
        : season % 10 === 1 ? 'st' : season % 10 === 2 ? 'nd' : season % 10 === 3 ? 'rd' : 'th'
      for (const base of cleanTitles) {
        const stripped = stripQualifiers(base) || base
        // Strip !/? so Nyaa AND-search can match scene group titles (Erai-raws
        // omits the ! in "Mairimashita! Iruma-kun").
        const cleanBase = stripped.replace(/[!?]+/g, '') || stripped
        add(`${cleanBase} S${String(season).padStart(2, '0')} ${searchContext.episode}`, cleanBase)
        add(`${cleanBase} Season ${season} ${searchContext.episode}`, cleanBase)
        // For ordinal variant (e.g. "4th Season"), strip the trailing bare
        // season number so we search "Iruma-kun 4th Season 10" not
        // "Iruma-kun 4 4th Season 10" — the latter has too many AND terms
        // for Nyaa and misses Erai-raws which uses "4th Season" notation.
        const ordinalBase = cleanBase.replace(new RegExp(`\\s+0*${season}\\s*$`), '') || cleanBase
        add(`${ordinalBase} ${season}${sfx} Season ${searchContext.episode}`, ordinalBase)
      }
    }
  }

  // (5) batch-qualified terms — when in batch mode, search for batch-specific
  //     patterns: the word "batch", "complete", and episode ranges like "1-21".
  //     Also include single episode terms since some batch releases are labeled
  //     with individual episode numbers (e.g. a pack uploaded per-episode).
  //     Nyaa treats ~ as a word separator, but some releases use "01 ~ 21"
  //     with spaces, so include both - and ~ variants.
  if (searchContext.mode === 'batch') {
    const epCount = searchContext.episodeCount
    const padded = epCount ? String(epCount).padStart(2, '0') : null
    for (const base of cleanTitles) {
      const stripped = stripQualifiers(base) || base
      const cleanBase = stripped.replace(/[!?]+/g, '') || stripped
      add(`${cleanBase} batch`, cleanBase)
      add(`${cleanBase} complete`, cleanBase)
      if (epCount) {
        add(`${cleanBase} 1-${epCount}`, cleanBase)
        add(`${cleanBase} 01-${padded}`, cleanBase)
        add(`${cleanBase} 01-${epCount}`, cleanBase)
        add(`${cleanBase} 1-${padded}`, cleanBase)
        add(`${cleanBase} 01 ~ ${padded}`, cleanBase)
        add(`${cleanBase} 1 ~ ${epCount}`, cleanBase)
      }
    }
  }

  return plan
}

function normalizeSearch(title) {
  return String(title).normalize('NFKC').replace(/\s+/g, ' ').trim()
}

// Hayase's titles array also contains native-language titles and synonyms.
// Prefer the explicit Romaji/English fields when they are available, while
// retaining the generated season aliases Hayase normally adds to the array.
function getSearchTitles(query = {}) {
  const mediaTitles = query.media?.title ?? {}
  const preferred = []
  const seen = new Set()

  const add = (title) => {
    const normalized = normalizeSearch(title)
    if (!normalized || seen.has(normalized.toLowerCase())) return
    seen.add(normalized.toLowerCase())
    preferred.push(normalized)
  }

  for (const title of [mediaTitles.romaji, mediaTitles.english]) {
    if (typeof title !== 'string' || !title.trim()) continue
    add(title)

    const ordinal = title.match(/(\d{1,2})(?:st|nd|rd|th) Season/i)
    const season = title.match(/Season (\d{1,2})/i)
    if (season) add(title.replace(/Season \d{1,2}/i, `S${season[1]}`))
    else if (ordinal) add(title.replace(/\d{1,2}(?:st|nd|rd|th) Season/i, `S${ordinal[1]}`))
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

function removeBalancedGroups(text, open, close) {
  const stack = []
  const ranges = []

  for (let index = 0; index < text.length; index++) {
    if (text[index] === open) stack.push(index)
    else if (text[index] === close && stack.length) {
      const start = stack.pop()
      if (!stack.length) ranges.push({ start, end: index + 1 })
    }
  }

  if (!ranges.length) return text
  let stripped = text
  for (let index = ranges.length - 1; index >= 0; index--) {
    const { start, end } = ranges[index]
    stripped = stripped.slice(0, start) + stripped.slice(end)
  }
  return stripped
}

function buildSearchVariants(title) {
  const normalized = normalizeSearch(title)
  const variants = []
  const seen = new Set()
  const add = (variant) => {
    const value = normalizeSearch(variant)
    if (!value || seen.has(value.toLowerCase())) return
    seen.add(value.toLowerCase())
    variants.push(value)
  }

  add(normalized)
  for (let index = 0; index < variants.length; index++) {
    const current = variants[index]
    for (const stripped of stripTrailingQualifierVariants(current)) add(stripped)

    // Strip ! and ? so scene groups without punctuation in their titles are found
    // (e.g. Erai-raws uses "Mairimashita Iruma-kun" without the "!")
    add(current.replace(/[!?]/g, '').replace(/\s+/g, ' ').trim())
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
    for (let index = end - 1; index >= 0; index--) {
      if (text[index] === close) depth++
      else if (text[index] === open && --depth === 0) {
        start = index
        break
      }
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

  for (let index = text.length - 1; index >= 0; index--) {
    const char = text[index]
    if (char === ')') parentheses++
    else if (char === '(') parentheses--
    else if (char === ']') brackets++
    else if (char === '[') brackets--
    else if (char === ':' && parentheses === 0 && brackets === 0) return index
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

function parseRssResults(xml) {
  const items = String(xml).split('<item>').slice(1)
  return items.map(item => {
    const extract = (tag) => {
      const start = item.indexOf('<' + tag + '>')
      const end = item.indexOf('</' + tag + '>')
      return start >= 0 && end > start ? item.slice(start + tag.length + 2, end) : ''
    }

    const hash = extract('nyaa:infoHash')
    const title = extract('title').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
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
  const multipliers = { KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KIB: 1024, MIB: 1048576, GIB: 1073741824, TIB: 1099511627776 }
  return value * (multipliers[unit] || 0)
}

function extractTags(title, magnet = '') {
  const tags = []
  if (/\bmulti[\s-]?sub\b/i.test(title) || /\bmulti[\s-]?sub\b/i.test(decodeURIComponentSafe(magnet))) {
    tags.push('Multi Sub')
  }
  return tags
}

function decodeURIComponentSafe(value = '') {
  try {
    return decodeURIComponent(String(value))
  } catch {
    return String(value)
  }
}

// ---- Filtering -------------------------------------------------------------
//
// The filter is intentionally lenient: Nyaa RSS already only returns items
// that match the query string, We reject only (a) excluded keywords and
// (b) a clearly conflicting single episode. Everything else is kept and ranked.

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
    if (!isPlausibleEpisode(title, searchContext.episode)) {
      return false
    }
  }

  if (searchContext.mode === 'batch') {
    if (!matchesBatch(title, searchContext.episodeCount)) return false
  }

  return true
}

// Picks the season the user is asking for, across all supplied titles.
// Recognises explicit markers (S2, Season 4, 4th Season) AND a trailing bare
// number on the show title (e.g. "Iruma-kun 4", "Show 2") — the latter is how
// many sequel titles arrive from Hayase. Returns null when no season can be
// inferred (don't filter on season in that case).
function detectQuerySeason(titles) {
  let maxSeason = null
  for (const t of titles) {
    const s = detectSeason(t)
    if (s != null) maxSeason = maxSeason == null ? s : Math.max(maxSeason, s)
  }
  return maxSeason
}

function isPlausibleEpisode(title, ep) {
  if (!ep) return true
  const verdict = classifyEpisode(title, ep)
  return verdict === 'exact'
}

function hasExcludedKeyword(title, exclusions = []) {
  const lowered = title.toLowerCase()
  return exclusions.some(exclusion => lowered.includes(String(exclusion).toLowerCase()))
}

function matchesResolution(title, resolution) {
  if (!resolution) return true
  return new RegExp(`(?:^|[^0-9])${resolution}p?(?:[^0-9]|$)`, 'i').test(title)
}

function hasAnyResolution(title) {
  return /\b(?:2160|1080|720|540|480)p\b/i.test(title)
}

// Strip resolution / size / dimension / season noise so leftover digits
// are more likely to be episode numbers, not false positives.
function stripEpisodeNoise(title) {
  return String(title)
    .replace(/\b\d{3,4}p\b/gi, ' ')                              // 1080p, 720p
    .replace(/\b\d{1,5}\s*[xX]\s*\d{1,5}\b/g, ' ')               // 1920x1080
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:KiB|MiB|GiB|TiB|KB|MB|GB)\b/gi, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')                         // years
    .replace(/\[[0-9A-Fa-f]{8,}\]/g, ' ')                        // [AB12CD34] release ids
    .replace(/\b0*(\d{1,4})\s*[Vv]\d{1,2}\b/g, ' $1 ')           // 12v2 / 12 v2 → 12 (version suffix)
    .replace(/\b[Ss](?:eason)?\s*\d{1,2}\b/g, ' ')                // S2, Season 02, s1
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\s+[Ss]eason\b/gi, ' ')    // 2nd Season, 3rd Season
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\b\s*(?=$)/gi, ' ')         // 3rd, 4th (trailing ordinal, no "Season")
    .replace(/\b(XXX?IX|XXX?IV|XXX?V?I{0,3}|XXI{0,3}|XIV|XIX|XL|XLIX|X{1,3}|IV|V|VI{0,3}|IX|I{1,3})\b\s*$/gi, ' ') // trailing roman numeral season
    .replace(/(?:^|\s)0*(\d{1,2})\s*$/, (match, _number, offset, source) => {
      // Preserve a dash-separated episode such as "Show - 02".
      return /[-–]\s*$/.test(source.slice(0, offset)) ? match : ' '
    })
    .replace(/\b0*(\d{1,2})\s+[-–]\s+(?=(?:E|EP)?\s*0*\d{1,4}\b)/gi, ' ')
}

const ROMAN_MAP = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10, XI:11, XII:12, XIII:13, XIV:14, XV:15, XVI:16, XVII:17, XVIII:18, XIX:19, XX:20, XXI:21, XXII:22, XXIII:23, XXIV:24, XXV:25, XXVI:26, XXVII:27, XXVIII:28, XXIX:29, XXX:30, XXXI:31, XXXII:32, XXXIII:33, XXXIV:34, XXXV:35, XXXVI:36, XXXVII:37, XXXVIII:38, XXXIX:39 }
const ROMAN_RE = /\b(XXX?IX|XXX?IV|XXX?V?I{0,3}|XXI{0,3}|XIV|XIX|XL|XLIX|X{1,3}|IV|V|VI{0,3}|IX|I{1,3})\b/g

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
  // Trailing bare number preceded by a space (not a dash) — "Show 4" → S4.
  // Requires a space before the number so "Show 4 - 10" doesn't match "10".
  // Reject if preceded by a dash (episode slot like "Show - 02").
  if (allowTrailingBare) {
    m = text.match(/(?:^|\s)0*(\d{1,2})\s*$/)
    if (m && !/[-–]\s*\d{1,2}\s*$/.test(text)) return Number(m[1])
  }
  return null
}

// Like detectSeason, but additionally recognises a trailing bare number on
// the show name when followed by an episode marker. "Iruma-kun 3 - 16" means
// season 3; we only accept the bare number when an episode delimiter is
// present so we don't misread the episode itself as a season.
function detectResultSeason(title) {
  const explicit = detectSeasonInternal(title, false)
  if (explicit != null) return explicit
  const text = String(title)
  // "Show <n> - <ep>" or "Show <n> E<ep>" or "Show <n> <ep>"
  const m = text.match(/\b0*(\d{1,2})(?:\s*[-–]\s*(?:E|EP)?\s*\d|\s+E\d|\s+S\d{1,2}E\d)/i)
  if (m) {
    const candidate = Number(m[1])
    // sanity: seasons 1-99 only
    if (candidate >= 1 && candidate <= 99) return candidate
  }
  return null
}

// Returns 'exact' | 'range' | 'conflict' | 'absent'
//   exact    → title contains the requested episode as a single
//   range    → title contains a range that covers the requested episode
//              (e.g. "09-12" for ep 11). These are batch releases that happen
//              to include our episode; in single mode the user wants a
//              standalone release, so callers treat 'range' as not-a-match.
//   conflict → title contains a *different* explicit episode number
//   absent   → no episode number could be found in the title at all
function classifyEpisode(title, ep) {
  if (!ep) return 'absent'
  const cleaned = stripEpisodeNoise(title)
  const epNum = Number(ep)

  const allNums = []
  let m

  // Unambiguous E / EP / S01E12 prefixes
  const eRe = /\b(?:S\d{1,2})?[Ee][Pp]?\.?\s*0*(\d{1,4})\b/g
  while ((m = eRe.exec(cleaned))) allNums.push(Number(m[1]))

  // Dash / space separated single number in the episode slot:
  // "[Group] Show - 12", "Show 12 END", "One Piece - 1100"
  const slotRe = /(?:^|[\s_\-])[\-]\s*0*(\d{1,4})(?=[\s_\-)\]\.,]|$)/g
  while ((m = slotRe.exec(cleaned))) allNums.push(Number(m[1]))

  // Standalone " <num> " (1-3 digits only, to avoid colliding with leftover noise)
  const standaloneRe = /(?:^|[\s_\-])0*(\d{1,3})(?=[\s_)\]\.,]|$)/g
  while ((m = standaloneRe.exec(cleaned))) allNums.push(Number(m[1]))

  // Ranges (e.g. "01-10", "1~12", "01 to 12") — collect covered ranges.
  // No \s* around the separator so "4 - 14" (season 4, ep 14) is NOT matched
  // as a range — only compact "01-10" or tilde "1~12" or word "01 to 12".
  const rangeRe = /\b0*(\d{1,4})(?:[-~]|to)0*(\d{1,4})(?=\D|$)/gi
  while ((m = rangeRe.exec(cleaned))) {
    const lo = Number(m[1])
    const hi = Number(m[2])
    const lo2 = Math.min(lo, hi)
    const hi2 = Math.max(lo, hi)
    // Register range endpoints as episode evidence too
    allNums.push(lo2, hi2)
    if (epNum > lo2 && epNum < hi2) return 'range'   // strictly inside → batch covering ep
  }

  if (!allNums.length) return 'absent'
  if (allNums.includes(epNum)) return 'exact'
  return 'conflict'
}

function matchesBatch(title, episodeCount) {
  if (/\b(batch|complete|full|collection|pack|全集)\b/i.test(title)) return true

  // A season-only title can describe a pack, but season notation plus an
  // episode marker is an individual release unless stronger batch evidence
  // appears below.
  const hasSeasonMarker = /\b(?:\d+(?:st|nd|rd|th)\s+[Ss]eason|[Ss]eason\s*0?\d|[Ss]0?\d)\b/i.test(title)
  const hasEpisodeMarker = /\b(?:S\d{1,2}E\d{1,4}|E[Pp]?\.?\s*\d{1,4})\b|[-–]\s*(?:E[Pp]?\.?\s*)?\d{1,4}\b/i.test(title)
  if (hasSeasonMarker && !hasEpisodeMarker) return true

  // Any explicit season (S1, S2, ...) plus a range reads as a batch
  if (/\b[Ss](?:eason)?\s*0?\d\b/.test(title) && /\b0*\d{1,4}\s*[-~]\s*0*\d{1,4}\b/.test(title)) return true

  if (episodeCount) {
    const padded = String(episodeCount).padStart(2, '0')
    const start = '(?:0?1|01)'
    const end = `(?:0?${episodeCount}|${padded})`
    if (new RegExp(`(?:^|[^0-9])(?:ep\\.?\\s*)?${start}\\s*(?:[-~]|to|x|/)\\s*${end}(?:[^0-9]|$)`, 'i').test(title)) return true
    if (new RegExp(`(?:^|[^0-9])${start}\\s*of\\s*${end}(?:[^0-9]|$)`, 'i').test(title)) return true
  }

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
  const referenceTitle = bestMatchingQueryTitle(queryTitles, result.title)

  const similarity = bestTitleSimilarity(queryTitles, result.title)
  if (similarity > 0.7) score += 40
  else if (similarity > 0.4) score += 12
  else score -= 15  // unrelated noise sinks to the bottom

  if (searchContext.mode === 'single' && searchContext.episode) {
    const verdict = classifyEpisode(result.title, searchContext.episode)
    if (verdict === 'exact') score += 30
    else if (verdict === 'conflict') score -= 30
    // season alignment bonus
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
    if (score > bestScore) {
      bestScore = score
      bestTitle = title
    }
  }

  return bestTitle
}

function bestTitleSimilarity(queryTitles, resultTitle) {
  const titles = Array.isArray(queryTitles) ? queryTitles : [queryTitles]
  let best = 0

  for (const title of titles) {
    best = Math.max(best, titleSimilarity(title, resultTitle))
  }

  return best
}

function titleSimilarity(queryTitle, resultTitle) {
  const queryWords = wordSet(queryTitle)
  const resultWords = wordSet(resultTitle)
  if (!queryWords.size) return 0

  let matches = 0
  for (const word of queryWords) {
    if (resultWords.has(word)) matches++
  }
  return matches / queryWords.size
}

function wordSet(value) {
  return new Set(String(value).toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(word => word.length > 1))
}
