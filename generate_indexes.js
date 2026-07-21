import { writeFileSync } from 'fs';

const sources = [
  {
    id: "nyaanew",
    script: "nyaasi",
    name: "Nyaa",
    description: "Searches Nyaa for anime torrents.",
    icon: "https://nyaa.si/static/favicon.png",
    type: "torrent",
    media: "both",
    url: "https://nyaa.si",
    version: "1.1.1"
  },
];

const REPO_BASE = "https://raw.githubusercontent.com/x7amod/Hayase-Nyaa/main";

// Hayase index
const hayaseIndex = sources.map((s) => ({
  id: `hayase.extension.${s.id}`,
  manifestVersion: 2,
  deprecated: false,
  name: s.name,
  description: s.description,
  version: s.version,
  type: s.type,
  accuracy: "medium",
  ratio: 0,
  media: s.media,
  languages: ["ALL"],
  icon: s.icon,
  url: s.url ? Buffer.from(s.url).toString('base64') : undefined,
  update: `${REPO_BASE}/hayase/index.json`,
  code: `${REPO_BASE}/hayase/${s.script}.js`,
}));

writeFileSync("./hayase/index.json", JSON.stringify(hayaseIndex, null, 2));
writeFileSync("./index.json", JSON.stringify(hayaseIndex, null, 2));

console.log("All indexes generated successfully!");
