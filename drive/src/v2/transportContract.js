function detailMessage(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === "string" ? item : item?.msg || item?.message || ""))
      .filter(Boolean)
      .join("; ");
  }
  if (detail && typeof detail === "object") return detail.message || detail.msg || JSON.stringify(detail);
  return "";
}

export function normalizeApiError(data, status, path) {
  return data?.message || data?.error || detailMessage(data?.detail) || `${status || "Request failed"} ${path || ""}`.trim();
}

export function decodeNdjson(buffer = "", chunk = "", { final = false } = {}) {
  const combined = `${buffer || ""}${chunk || ""}`;
  const lines = combined.split("\n");
  const remainder = final ? "" : lines.pop() || "";
  const events = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { events, buffer: remainder };
}

export function createRequestAbort(timeoutMs = 0, externalSignal = null) {
  const duration = Number(timeoutMs);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { signal: externalSignal || undefined, cancel() {}, timedOut: () => false };
  }

  const controller = new AbortController();
  let timeoutTriggered = false;
  const forwardAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) forwardAbort();
  else externalSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, duration);

  return {
    signal: controller.signal,
    timedOut: () => timeoutTriggered,
    cancel() {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", forwardAbort);
    },
  };
}
