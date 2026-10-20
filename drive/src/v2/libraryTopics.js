export const LIBRARY_TOPICS = [
  { id: "economy", label: "Economy & labour", blurb: "Unemployment, prices, trade, rates and other official statistics." },
  { id: "us_markets", label: "US markets", blurb: "US equities, indexes and returns." },
  { id: "asia_markets", label: "Asian markets", blurb: "Exchanges, prices and trading across Asia." },
  { id: "crypto", label: "Crypto & on-chain", blurb: "Token prices, stablecoins and blockchain activity." },
  { id: "news", label: "News & events", blurb: "News intensity, shocks and dated events." },
  { id: "filings", label: "Filings & disclosures", blurb: "Company filings, disclosures and governance records." },
  { id: "climate", label: "Climate & environment", blurb: "Emissions, temperature and environmental records." },
  { id: "society", label: "Politics & society", blurb: "Democracy, elections and social indicators." },
  { id: "transport", label: "Transport & travel", blurb: "Airfares, routes and transport statistics." },
  { id: "science", label: "Science & health", blurb: "Earthquakes, wildfires, health surveys and other science data." },
  { id: "papers", label: "Papers & reports", blurb: "Research papers, reports and guides saved as evidence." },
  { id: "panels", label: "Research panels", blurb: "Panels and outputs built for analysis." },
  { id: "lookups", label: "Lookups & identifiers", blurb: "Mappings between names, tickers and identifiers." },
  { id: "catalogues", label: "Dataset catalogues", blurb: "Indexes of datasets to find more data." },
  { id: "downloads", label: "Your project downloads", blurb: "Files saved for a project that fit no topic yet." },
  { id: "other", label: "Other data", blurb: "Library data without a topic yet." },
];

const BY_ID = new Map(LIBRARY_TOPICS.map((topic, index) => [topic.id, { ...topic, sort: (index + 1) * 10 }]));

const HINTS = {
  crypto_onchain: "crypto",
  us_markets: "us_markets",
  asia_stocks: "asia_markets",
  news_events: "news",
  filings_disclosures: "filings",
  "reference.regulatory.sec": "filings",
  lookups_ids: "lookups",
  find_datasets: "catalogues",
};

const RULES = [
  ["transport", /\b(airlines?|airfares?|flights?|aviation|airports?|openflights|transportation|db1b)\b/i],
  ["climate", /\b(co2|keeling|noaa|temperature|climate|emissions?|carbon|rainfall|weather)\b|\bco₂/i],
  ["crypto", /\b(crypto\w*|bitcoin|btc|ethereum|eth|tokens?|stablecoins?|de-?peg|defi|on-?chain|binance|coingecko|nft|solana|xrp|usdt)\b/i],
  ["society", /\b(democracy|v-dem|elections?|electoral|polity|human rights)\b/i],
  ["filings", /\b(sec filings?|10-k|20-f|annual report|disclosures?|mops|companyfacts|earnings release)\b/i],
  ["asia_markets", /\b(twse|taiex|tpex|jkse|idx|kospi|nikkei|taiwan stock|indonesia\w* stock|asia\w* (stock|equit\w*|market))/i],
  ["us_markets", /\b(s&p|crsp|nyse|nasdaq|shiller|compustat|wrds|us stock)/i],
  ["economy", /\b(unemploy\w*|labou?r|cpi|inflation|gdp|exports?|imports?|interest rates?|discount rates?|central bank|treasury|yields?|bls|fred|singstat|world bank|imf|ecb|oecd|census|wages?|consumer price)\b/i],
  ["news", /\b(gdelt|news)\b/i],
  ["science", /\b(earthquakes?|seismic|usgs|emsc|wildfires?|active fire|viirs|nhanes|health|cdc|disease|marine|ocean)\b/i],
  ["papers", /\b(paper|report|guide|working paper|article|thesis)\b/i],
];

function haystack(row = {}) {
  return [row.title, row.name, row.description, row.source_id, row.source, row.source_system]
    .map((value) => String(value || ""))
    .join(" ");
}

const DOMAIN_FIRST = new Set(["transport", "climate", "society", "science"]);

export function datasetTopic(row = {}) {
  const hint = String(row.shelf_hint || "").trim();
  const text = haystack(row);
  for (const [id, pattern] of RULES) {
    if (DOMAIN_FIRST.has(id) && pattern.test(text)) return BY_ID.get(id);
  }
  if (HINTS[hint]) return BY_ID.get(HINTS[hint]);
  for (const [id, pattern] of RULES) {
    if (!DOMAIN_FIRST.has(id) && pattern.test(text)) return BY_ID.get(id);
  }
  const partition = String(row.partition_id || row.collection?.partition_id || "");
  if (hint === "analysis_ready" || String(row.source_system || "") === "derived_synthesis" || partition.startsWith("derived.")) return BY_ID.get("panels");
  if (hint === "project_downloads") return BY_ID.get("downloads");
  return BY_ID.get("other");
}

export function topicById(id) {
  return BY_ID.get(id) || BY_ID.get("other");
}

const UNLISTED_TOPICS = new Set(["other", "downloads", "lookups", "catalogues"]);

export function topicCounts(rows = [], limit = 6) {
  const counts = new Map();
  for (const row of rows) {
    const topic = datasetTopic(row);
    if (UNLISTED_TOPICS.has(topic.id)) continue;
    counts.set(topic.id, (counts.get(topic.id) || 0) + 1);
  }
  return [...counts]
    .map(([id, count]) => ({ id, label: topicById(id).label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}
