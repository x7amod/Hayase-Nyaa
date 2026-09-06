import { SIZE_MULTIPLIERS } from './constants.js'

export async function fetchResults(fetcher, base, term, signal) {
  const url = base + encodeURIComponent(term)
  const response = signal ? await fetcher(url, { signal }) : await fetcher(url)
  if (!response.ok) return []
  const text = await response.text()
  return parseRssResults(text)
}

export function toTorrentResult(item) {
  const tags = normalizeTags(item.tags || item.Tags)
  const parsedDate = item.DateUploaded ? new Date(item.DateUploaded) : null
  return {
    title: item.Name,
    link: item.Magnet,
    hash: item.hash || item.Magnet?.match(/btih:([A-Za-z0-9]+)/)?.[1] || '',
    seeders: Number(item.Seeders || 0),
    leechers: Number(item.Leechers || 0),
    downloads: Number(item.Downloads || 0),
    size: Number(item.SizeBytes || 0),
    date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date(),
    accuracy: 'medium',
    tags,
    Tags: tags,
  }
}

export function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean)
  if (typeof tags === 'string' && tags.trim()) return [tags.trim()]
  return []
}

export function decodeXmlEntities(str) {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => decodeCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => decodeCodePoint(parseInt(h, 16)))
}

export function parseRssResults(xml) {
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
    const rawSizeBytes = Number(extract('nyaa:sizeBytes'))
    const size = Number.isFinite(rawSizeBytes) && rawSizeBytes > 0 ? rawSizeBytes : parseSize(sizeStr)
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
      tags,
    }
  })
}

export function parseSize(sizeStr) {
  if (!sizeStr) return 0
  const match = sizeStr.match(/([\d.]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  return value * (SIZE_MULTIPLIERS[unit] || 0)
}

function decodeCodePoint(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0x10FFFF ? String.fromCodePoint(value) : ''
}

export function extractTags(title, magnet = '') {
  const tags = []
  if (/\bmulti[\s-]?sub\b/i.test(title) || /\bmulti[\s-]?sub\b/i.test(decodeURIComponentSafe(magnet))) tags.push('Multi Sub')
  return tags
}

export function decodeURIComponentSafe(value = '') {
  try { return decodeURIComponent(String(value)) } catch { return String(value) }
}
