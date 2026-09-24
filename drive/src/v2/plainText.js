const PROPER_NAMES = {
  api: "API", csv: "CSV", http: "HTTP", json: "JSON", bigquery: "BigQuery", ccm: "CCM", coingecko: "CoinGecko", compustat: "Compustat", crsp: "CRSP",
  datacite: "DataCite", doi: "DOI", edgar: "EDGAR", lseg: "LSEG", mops: "MOPS", moveit: "MOVEit",
  openapi: "OpenAPI", refinitiv: "Refinitiv", sec: "SEC", tw: "Taiwan", twse: "TWSE", url: "URL",
  wrds: "WRDS", yfinance: "Yahoo Finance", yzu: "YZU",
};

export function plainIdentifiers(value) {
  return String(value || "")
    .split(" · ")
    .map((part) => part.trim().replace(/(?<![\w/.])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w/.])/g, (identifier) => {
      const words = identifier.split("_").map((word) => PROPER_NAMES[word] || word);
      const phrase = words.join(" ");
      return phrase.charAt(0).toUpperCase() + phrase.slice(1);
    }))
    .join(" · ");
}
