/**
 * Research Drive v2 API surface.
 *
 * The broad HTTP client remains byte-for-byte in apiCore.js. Ask uses the
 * adapter below so native backend Synthesis object targets survive both NDJSON
 * streaming and the Cloudflare-buffered /library/chat production path.
 */

export * from "./apiCore.js";

import { API } from "./apiCore.js";
import {
  deskFetchInit,
  loadUserEmail,
  saveChatSessionId,
} from "./deskSession.js";
import { decodeNdjson, normalizeApiError } from "./transportContract.js";

function activityEnvelope(event = {}) {
  const row = event && typeof event === "object" ? event : { text: event };
  const target = row.target && typeof row.target === "object" ? row.target : undefined;
  return {
    text: String(row.text || ""),
    action: row.action || null,
    elapsed_seconds: row.elapsed_seconds,
    target,
    object_kind: row.object_kind,
    object_id: row.object_id,
    object_label: row.object_label,
    target_kind: row.target_kind,
    target_id: row.target_id,
    target_label: row.target_label,
    surface: row.surface,
    surface_testid: row.surface_testid,
    target_surface: row.target_surface,
    target_selector: row.target_selector,
  };
}

function hiddenSynthesisObjectContext(message = "") {
  const text = String(message || "");
  const marker = "Selected Synthesis object context:";
  const start = text.lastIndexOf(marker);
  if (start < 0) return null;
  const block = text.slice(start + marker.length);
  const pick = (label) => {
    const match = block.match(new RegExp(`(?:^|\\n)${label}:\\s*([^\\n]+)`, "i"));
    return String(match?.[1] || "").trim().replace(/\.$/, "");
  };
  const kind = pick("Kind");
  if (!kind) return null;
  const objectId = pick("Object id");
  const label = pick("Label");
  const surface = pick("Surface");
  return {
    kind,
    object_id: objectId || undefined,
    label: label || undefined,
    surface: surface || undefined,
  };
}

function requestRailContext(message, railContext) {
  if (!railContext || typeof railContext !== "object") return undefined;
  const selectedObject = hiddenSynthesisObjectContext(message);
  if (!selectedObject) return railContext;
  return {
    ...railContext,
    synthesis_object_context: selectedObject,
  };
}

function replayBufferedActivity(payload, onActivity) {
  const rows = Array.isArray(payload?.activity_events) ? payload.activity_events : [];
  rows.forEach((event) => {
    const activity = activityEnvelope(event);
    if (activity.text) onActivity?.(activity);
  });
}

export async function sendChatMessage(
  message,
  { sessionId, userEmail, railContext, onDelta, onActivity } = {},
) {
  const effectiveRailContext = requestRailContext(message, railContext);
  const body = JSON.stringify({
    message,
    session_id: sessionId || undefined,
    user_email: userEmail || loadUserEmail() || undefined,
    rail_context: effectiveRailContext,
  });

  const consumeEvent = (event, state) => {
    if (event.type === "delta" && event.text) onDelta?.(event.text);
    if ((event.type === "activity" || event.type === "progress") && event.text) {
      onActivity?.(activityEnvelope(event));
    }
    if (event.type === "error") throw new Error(event.message || event.error || "Chat stream error");
    if (event.type === "complete") state.result = event.result || null;
  };

  const sendNonStream = async () => {
    // Local liveness remains useful while Cloudflare buffers the real turn.
    // Once the backend response arrives, replay its bounded target-bearing
    // receipts so production reaches the same Synthesis objects as NDJSON dev.
    const started = Date.now();
    const tick = setInterval(() => {
      const elapsed = Math.round((Date.now() - started) / 1000);
      onActivity?.({ text: "Working…", elapsed_seconds: elapsed });
    }, 1500);
    try {
      let fallback;
      let payload = {};
      for (let attempt = 0; attempt < 2; attempt += 1) {
        fallback = await fetch(
          `${API}/library/chat`,
          deskFetchInit({
            method: "POST",
            body,
          }),
        );
        payload = await fallback.json().catch(() => ({}));
        if (fallback.ok) break;
        if (![502, 503, 504].includes(fallback.status) || attempt === 1) {
          throw new Error(normalizeApiError(payload, fallback.status, "/library/chat"));
        }
        onActivity?.({
          text: "Desk reconnecting…",
          elapsed_seconds: Math.round((Date.now() - started) / 1000),
        });
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (payload.session_id) saveChatSessionId(payload.session_id);
      replayBufferedActivity(payload, onActivity);
      if (payload.reply) onDelta?.(String(payload.reply));
      return payload;
    } finally {
      clearInterval(tick);
    }
  };

  const preferStream =
    Boolean(import.meta.env.DEV) || String(import.meta.env.VITE_ASK_STREAM || "").trim() === "1";
  if (!preferStream) return sendNonStream();

  const streamRes = await fetch(`${API}/library/chat/stream`, deskFetchInit({
    method: "POST",
    body,
  }));
  const contentType = streamRes.headers.get("content-type") || "";

  if (streamRes.ok && contentType.includes("ndjson") && streamRes.body) {
    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    const state = { result: null };
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const decoded = decodeNdjson(buffer, decoder.decode(value, { stream: true }));
      buffer = decoded.buffer;
      decoded.events.forEach((event) => consumeEvent(event, state));
    }
    const tail = decodeNdjson(buffer, decoder.decode(), { final: true });
    tail.events.forEach((event) => consumeEvent(event, state));
    if (!state.result) throw new Error("Chat ended without a response");
    if (state.result.session_id) saveChatSessionId(state.result.session_id);
    return state.result;
  }

  if (streamRes.ok) {
    const payload = await streamRes.json().catch(() => ({}));
    if (payload.session_id) saveChatSessionId(payload.session_id);
    replayBufferedActivity(payload, onActivity);
    return payload;
  }

  if (![404, 405, 406, 415].includes(streamRes.status)) {
    const streamError = await streamRes.json().catch(() => ({}));
    throw new Error(normalizeApiError(streamError, streamRes.status, "/library/chat/stream"));
  }

  return sendNonStream();
}
