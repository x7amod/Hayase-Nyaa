const RSS_TEMPLATE = (items) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa">
<channel>
<title>Nyaa - RSS</title>
${items.map(item => `<item>
<title><![CDATA[${item.title}]]></title>
<link>https://nyaa.si/view/000000</link>
<guid isPermaLink="false">000000</guid>
<pubDate>${item.date || 'Mon, 01 Jan 2026 00:00:00 +0000'}</pubDate>
<nyaa:seeders>${item.seeders ?? 0}</nyaa:seeders>
<nyaa:leechers>${item.leechers ?? 0}</nyaa:leechers>
<nyaa:downloads>${item.downloads ?? 0}</nyaa:downloads>
<nyaa:infoHash>${item.hash || '0'.repeat(40)}</nyaa:infoHash>
<nyaa:size>${item.size || '0 B'}</nyaa:size>
<nyaa:categoryId>1_2</nyaa:categoryId>
<nyaa:category>Anime - English-translated</nyaa:category>
<nyaa:sizeBytes>${item.sizeBytes ?? 0}</nyaa:sizeBytes>
</item>`).join('\n')}
</channel>
</rss>`

export function buildRss(items) {
  return RSS_TEMPLATE(items)
}

export function makeItem(overrides) {
  return {
    title: '[SubsPlease] Example - 01 (1080p) [ABCDEF12].mkv',
    seeders: 100,
    leechers: 10,
    hash: 'a'.repeat(40),
    ...overrides,
  }
}

export function mockFetch(rssXml) {
  return async () => ({ ok: true, text: async () => rssXml, status: 200 })
}
