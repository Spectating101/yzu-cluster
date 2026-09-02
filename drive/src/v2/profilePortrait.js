import { sendChatMessage } from "@/v2/api";
import { clearChatSessionId, loadChatSessionId, saveChatSessionId } from "@/v2/deskSession";

const CACHE_PREFIX = "rd_profile_portrait_v1:";

function cleanText(value, max = 700) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function cleanList(value, limit = 10) {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, limit);
}

function cleanObjects(value, limit = 8) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === "object")
    .slice(0, limit)
    .map((item) => {
      const out = {};
      for (const [key, raw] of Object.entries(item)) {
        if (raw == null) continue;
        if (Array.isArray(raw)) out[key] = cleanList(raw, 8);
        else if (["string", "number", "boolean"].includes(typeof raw)) out[key] = cleanText(raw, 500);
      }
      return out;
    });
}

export function profilePortraitSource(profile, libraryHoldings = []) {
  if (!profile || profile.unknown) return null;
  return {
    identity: {
      name: cleanText(profile.name_en || profile.name, 180),
      title: cleanText(profile.title, 180),
      discipline: cleanText(profile.discipline, 180),
      email: cleanText(profile.email, 220),
    },
    research: {
      specialties: cleanList(profile.specialties, 12),
      current_research: cleanText(profile.current_research, 1200),
      research_tracks: cleanObjects(profile.research_tracks, 10),
      methods: cleanList(profile.method_tags?.length ? profile.method_tags : profile.methods, 12),
      domain_tags: cleanList(profile.domain_tags, 12),
    },
    works: {
      paper_count: Number(profile.paper_count_parsed || profile.paper_count || 0) || 0,
      publication_highlights: cleanList(profile.publication_highlights, 10),
    },
    evidence_links: cleanObjects(profile.lab_fintech_stack, 10),
    library_holdings: (libraryHoldings || []).slice(0, 16).map((row) => ({
      id: cleanText(row?.dataset_id || row?.id, 180),
      title: cleanText(row?.title || row?.name || row?.label, 320),
      source: cleanText(row?.source || row?.provider || row?.kind, 160),
    })).filter((row) => row.id || row.title),
  };
}

function stableHash(value) {
  const text = JSON.stringify(value || {});
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function profilePortraitKey(source) {
  const identity = source?.identity?.email || source?.identity?.name || "researcher";
  return `${CACHE_PREFIX}${encodeURIComponent(identity).slice(0, 180)}:${stableHash(source)}`;
}

function parseJsonReply(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("AI portrait returned no content");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!candidate || !candidate.startsWith("{")) throw new Error("AI portrait was not structured JSON");
  return JSON.parse(candidate);
}

function portraitItem(item) {
  if (typeof item === "string") return { label: cleanText(item, 180), read: "", basis: [] };
  if (!item || typeof item !== "object") return null;
  const label = cleanText(item.label || item.title || item.name, 180);
  const read = cleanText(item.read || item.explanation || item.connection || item.summary, 520);
  const basis = cleanList(item.basis || item.sources, 5);
  if (!label && !read) return null;
  return { label: label || "Research signal", read, basis };
}

function portraitItems(value, limit) {
  return (Array.isArray(value) ? value : []).map(portraitItem).filter(Boolean).slice(0, limit);
}

export function normalizeProfilePortrait(raw, source) {
  const overview = cleanText(raw?.overview, 1200);
  const headline = cleanText(raw?.headline, 220);
  if (!overview && !headline) throw new Error("AI portrait did not contain a usable summary");
  return {
    headline: headline || "Research profile",
    overview: overview || headline,
    themes: portraitItems(raw?.themes, 5),
    methods: portraitItems(raw?.methods, 5),
    connections: portraitItems(raw?.connections, 5),
    works: portraitItems(raw?.works, 6),
    evidence_read: cleanText(raw?.evidence_read, 700),
    unknowns: cleanList(raw?.unknowns, 5),
    source_count: Number(raw?.source_count || 0) || countSignals(source),
    generated: true,
  };
}

export function countSignals(source) {
  if (!source) return 0;
  return [
    source.identity?.title,
    source.identity?.discipline,
    ...(source.research?.specialties || []),
    source.research?.current_research,
    ...(source.research?.methods || []),
    ...(source.works?.publication_highlights || []),
    ...(source.evidence_links || []),
    ...(source.library_holdings || []),
  ].filter(Boolean).length;
}

function buildPrompt(source) {
  return `You are generating the signed-in researcher's AI research portrait for Research Drive.\n\n` +
    `The JSON below is the complete evidence boundary for this task. Treat it as authoritative input, not as prose to embellish.\n\n` +
    `${JSON.stringify(source, null, 2)}\n\n` +
    `Return ONLY valid JSON with this exact top-level shape:\n` +
    `{\n` +
    `  "headline": "short, specific research identity line",\n` +
    `  "overview": "2-4 sentences that synthesize the research program and what connects it",\n` +
    `  "themes": [{"label":"theme","read":"what the supplied evidence supports","basis":["field or work that supports this"]}],\n` +
    `  "methods": [{"label":"method or analytical lens","read":"how it appears to be used","basis":["support"]}],\n` +
    `  "connections": [{"label":"cross-cutting connection","read":"why this connection is visible across the supplied record","basis":["support"]}],\n` +
    `  "works": [{"label":"work title from publication_highlights only","read":"what this supplied work contributes to the portrait","basis":["publication_highlights"]}],\n` +
    `  "evidence_read": "what the supplied Library holdings/evidence links do and do not establish",\n` +
    `  "unknowns": ["important research-profile information the evidence does not establish"],\n` +
    `  "source_count": 0\n` +
    `}\n\n` +
    `Rules:\n` +
    `- Synthesize aggressively, but never fabricate.\n` +
    `- Distinguish explicit facts from interpretation. Use language such as “the record shows”, “the pattern suggests”, or “the supplied works connect” where appropriate.\n` +
    `- Never invent credentials, institutions, publication titles, impact, causal findings, grants, datasets, affiliations, or Library holdings.\n` +
    `- A missing field is unknown, not negative evidence.\n` +
    `- Do not praise the researcher. Describe the intellectual structure of the record.\n` +
    `- Prefer 3-5 high-information themes/connections over generic categories.\n` +
    `- For works, use only titles/text actually present in publication_highlights. If a citation cannot be safely normalized, preserve the supplied wording.\n` +
    `- Keep each read under 45 words.\n` +
    `- source_count should reflect the approximate number of distinct supplied signals you actually used.`;
}

export function fallbackProfilePortrait(source) {
  const specialties = source?.research?.specialties || [];
  const methods = source?.research?.methods || [];
  const current = source?.research?.current_research || "";
  const works = source?.works?.publication_highlights || [];
  const identity = source?.identity || {};
  const overviewBits = [];
  if (current) overviewBits.push(`The recorded current research is ${current}.`);
  if (specialties.length) overviewBits.push(`The profile explicitly lists ${specialties.join(", ")}.`);
  if (!overviewBits.length) overviewBits.push("The registry currently contains only limited research context; Research Drive will enrich this portrait as grounded evidence is added.");
  return {
    headline: [identity.discipline, identity.title].filter(Boolean).join(" · ") || "Research profile",
    overview: overviewBits.join(" "),
    themes: specialties.slice(0, 5).map((label) => ({ label, read: "Explicitly recorded research context.", basis: ["specialties"] })),
    methods: methods.slice(0, 5).map((label) => ({ label, read: "Explicitly recorded method or analytical lens.", basis: ["methods"] })),
    connections: [],
    works: works.slice(0, 6).map((label) => ({ label, read: "Publication highlight recorded in the researcher profile.", basis: ["publication_highlights"] })),
    evidence_read: source?.library_holdings?.length || source?.evidence_links?.length
      ? "Recorded evidence links and current Library holdings are shown below; only held Library records establish workspace possession."
      : "No grounded Library relationship is currently available for interpretation.",
    unknowns: [],
    source_count: countSignals(source),
    generated: false,
  };
}

export function readCachedProfilePortrait(source) {
  if (!source) return null;
  try {
    const raw = localStorage.getItem(profilePortraitKey(source));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedProfilePortrait(source, portrait) {
  try {
    localStorage.setItem(profilePortraitKey(source), JSON.stringify(portrait));
  } catch {
    /* cache is opportunistic */
  }
}

export async function generateProfilePortrait(profile, libraryHoldings = []) {
  const source = profilePortraitSource(profile, libraryHoldings);
  if (!source) return null;
  const previousSession = loadChatSessionId();
  try {
    const result = await sendChatMessage(buildPrompt(source), {
      userEmail: source.identity.email || undefined,
      railContext: {
        tab: "profile",
        mode: "research_portrait",
        read_only: true,
        evidence_boundary: "profile_registry_and_library",
      },
    });
    const portrait = normalizeProfilePortrait(parseJsonReply(result?.reply || result?.message || result?.text), source);
    writeCachedProfilePortrait(source, portrait);
    return portrait;
  } finally {
    // Profile synthesis is not an Ask conversation. Restore the user's existing
    // general Ask session so opening Profile cannot silently replace it.
    if (previousSession) saveChatSessionId(previousSession);
    else clearChatSessionId();
  }
}
