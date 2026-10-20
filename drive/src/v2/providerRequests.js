export function defaultProviderRequest(provider, url = "") {
  if (provider === "bls") return { start: "2023-01", end: "2023-01", counties: "06037" };
  if (provider === "bps") return { start: "2023", end: "2023", domain: "0000", variable_id: "145" };
  if (provider === "fred") return { start: "2023-01-01", end: "2023-01-31", series_ids: "MORTGAGE30US", frequency: "weekly", vintage_date: "" };
  if (provider === "wrds") return { start: "2023-01-01", end: "2023-12-31", table: "comp.funda", entity_ids: "001690" };
  if (provider.startsWith("lseg")) return { start: "2023-01-03", end: "2023-01-03", instruments: "IBM.N", fields: "TRDPRC_1" };
  return { start: "all", end: "all", url, want: "", table_index: "0", date_column: "" };
}

export function buildProviderRequest(provider, values) {
  const request = { start: values.start, end: values.end, max_requests: 25, max_rows: 10000, output_format: "parquet" };
  const list = (value) => String(value || "").split(",").map(v => v.trim()).filter(Boolean);
  if (provider === "bls") Object.assign(request, { counties: list(values.counties), measures: ["3"], api_version: "v2" });
  if (provider === "bps") Object.assign(request, { domain: values.domain, variable_id: values.variable_id });
  if (provider === "fred") Object.assign(request, { series_ids: list(values.series_ids), frequency: values.frequency });
  if (provider === "fred" && values.vintage_date) request.vintage_date = values.vintage_date;
  if (provider === "wrds") Object.assign(request, { table: values.table, entity_ids: list(values.entity_ids) });
  if (provider.startsWith("lseg")) Object.assign(request, { instruments: list(values.instruments), fields: list(values.fields), session_mode: provider === "lseg_desktop" ? "desktop" : "platform" });
  if (provider === "browser") {
    Object.assign(request, { url: values.url, want: list(values.want), table_index: Number(values.table_index) });
    if (values.date_column) request.date_column = values.date_column;
  }
  return request;
}

export const providerFieldLabels = {
  vintage_date: "FRED vintage date (optional)", start: "From", end: "Through", counties: "County FIPS codes (comma separated)", domain: "BPS domain code",
  variable_id: "BPS variable ID", series_ids: "FRED series IDs (comma separated)", frequency: "Frequency",
  table: "WRDS table", entity_ids: "WRDS entity IDs (comma separated)", instruments: "LSEG instruments (comma separated)",
  fields: "LSEG fields (comma separated)", url: "Source page or download URL", want: "Download link names (optional)",
  table_index: "Table number (starting at 0)", date_column: "Date column (optional)",
};
