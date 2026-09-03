import { selectorForSynthesisObjectContext } from "@/v2/synthesisObjectContext.js";

export const SYNTHESIS_AGENT_ACTIVITY_EVENT = "synthesis:agent-activity";

const MAX_ACTIVE_STEPS = 80;
const MAX_HISTORY_RUNS = 12;

function selectorForActivity(value = "") {
  const text = String(value || "").toLowerCase();
  if (!text) return "";
  if (/scope|row limit|population/.test(text)) return '[data-testid="synthesis-scope-block"]';
  if (/unit|rescal|normaliz|conversion/.test(text)) return '[data-testid="synthesis-unit-conflict"]';
  if (/join|key overlap|fanout|many-to-many/.test(text)) return '[data-testid="synthesis-join-decision"]';
  if (/preview|bounded test|sample execution/.test(text)) {
    return '[data-testid="synthesis-preview-state"], [data-testid="synthesis-execution-state"]';
  }
  if (/proposal|method revision|method proposal|accepted method/.test(text)) {
    return '[data-testid="synthesis-proposal-state"], [data-testid="synthesis-evidence-proposal"]';
  }
  if (/archive|manifest/.test(text)) {
    return '[data-testid="synthesis-execution-state"], [data-testid="synthesis-registered-state"]';
  }
  if (/registry|register|query-ready|library handoff/.test(text)) {
    return '[data-testid="synthesis-registered-state"], [data-testid="synthesis-query-ready-state"], [data-testid="synthesis-execution-state"]';
  }
  if (/build|worker|execut|materialis|materializ|approval|authoriz/.test(text)) {
    return '[data-testid="synthesis-execution-state"]';
  }
  if (/measure|profil|column|schema/.test(text)) return '[data-testid="synthesis-evidence-state"]';
  if (/evidence|source|library asset|held input|dataset/.test(text)) return '[data-testid="synthesis-evidence-state"]';
  return "";
}

function toneForActivity(value = "") {
  const text = String(value || "").toLowerCase();
  if (/fail|error|warn|paused|blocked|cannot|could not|unavailable|stale/.test(text)) return "warn";
  if (/complete|completed|passed|verified|accepted|recorded|selected|resolved|ready/.test(text)) return "done";
  return "current";
}

function runStateForActivity(value = "") {
  const text = String(value || "").toLowerCase();
  if (/^paused\b|blocked|failed|error/.test(text)) return "paused";
  if (/automation complete|query-ready|registration complete|run complete|turn complete/.test(text)) return "complete";
  return "running";
}

export function emptySynthesisAgentRun(threadId = "") {
  return {
    threadId: String(threadId || ""),
    id: "",
    state: "idle",
    startedAt: null,
    updatedAt: null,
    steps: [],
    history: [],
  };
}

export function synthesisAgentRunStorageKey(threadId) {
  return `rd_v2_synthesis_agent_run:${String(threadId || "")}`;
}

function normalizeTarget(value) {
  if (!value || typeof value !== "object") return null;
  const kind = String(value.kind || value.object_kind || "").trim();
  const objectId = String(value.object_id || value.id || "").trim();
  const label = String(value.label || value.object_label || "").trim();
  const surface = String(value.surface || value.surface_testid || "").trim();
  const selector = String(value.selector || selectorForSynthesisObjectContext(value) || "").trim();
  if (!kind && !objectId && !surface && !selector) return null;
  return {
    kind: kind || undefined,
    object_id: objectId || undefined,
    label: label || undefined,
    surface: surface || undefined,
    selector: selector || undefined,
  };
}

function normalizeStep(step = {}) {
  const text = String(step.text || "").trim();
  if (!text) return null;
  const at = Number(step.at) || Date.now();
  const target = normalizeTarget(step.target);
  return {
    id: String(step.id || `${at}:${text}`),
    text,
    action: step.action || null,
    elapsedSeconds: step.elapsedSeconds,
    tone: step.tone || toneForActivity(text),
    target,
    selector: step.selector || target?.selector || selectorForActivity(`${step.action || ""} ${text}`),
    at,
  };
}

function normalizeArchivedRun(run = {}, threadId = "") {
  if (!run?.id || !Array.isArray(run?.steps)) return null;
  return {
    threadId: String(run.threadId || threadId || ""),
    id: String(run.id),
    state: run.state === "paused" ? "paused" : "complete",
    startedAt: Number(run.startedAt) || null,
    updatedAt: Number(run.updatedAt) || null,
    steps: run.steps.map(normalizeStep).filter(Boolean).slice(-MAX_ACTIVE_STEPS),
  };
}

function archiveCurrentRun(run) {
  if (!run?.id || !run?.steps?.length) return Array.isArray(run?.history) ? run.history : [];
  const archived = normalizeArchivedRun(run, run.threadId);
  const history = Array.isArray(run.history) ? run.history : [];
  if (!archived) return history;
  const withoutSameRun = history.filter((item) => item?.id !== archived.id);
  return [...withoutSameRun, archived].slice(-MAX_HISTORY_RUNS);
}

function appendRunStep(run, detail = {}) {
  const step = normalizeStep(detail);
  if (!step) return run;
  const last = run.steps?.[run.steps.length - 1];
  if (
    last?.text === step.text &&
    last?.action === step.action &&
    String(last?.target?.object_id || "") === String(step?.target?.object_id || "") &&
    String(last?.target?.surface || "") === String(step?.target?.surface || "")
  ) return run;
  return {
    ...run,
    steps: [...(run.steps || []), step].slice(-MAX_ACTIVE_STEPS),
    updatedAt: step.at,
  };
}

export function reduceSynthesisAgentRun(current, detail = {}) {
  const threadId = String(detail.threadId || current?.threadId || "");
  const at = Number(detail.at) || Date.now();
  const kind = String(detail.kind || "activity");
  const text = String(detail.text || "").trim();
  let next = current?.threadId === threadId ? current : emptySynthesisAgentRun(threadId);

  if (kind === "run_started") {
    const history = archiveCurrentRun(next);
    next = {
      ...emptySynthesisAgentRun(threadId),
      history,
      id: String(detail.runId || `ask-${at}`),
      state: "running",
      startedAt: at,
      updatedAt: at,
    };
    return text ? appendRunStep(next, { ...detail, at }) : next;
  }

  if (!next.id) {
    next = {
      ...emptySynthesisAgentRun(threadId),
      history: Array.isArray(next.history) ? next.history : [],
      id: String(detail.runId || `run-${at}`),
      state: "running",
      startedAt: at,
      updatedAt: at,
    };
  }

  if (kind === "activity" || kind === "automation") {
    next = appendRunStep(next, { ...detail, at });
    return { ...next, state: runStateForActivity(text) };
  }
  if (kind === "run_failed") {
    next = appendRunStep(next, { ...detail, text: text || "Agent run failed", at });
    return { ...next, state: "paused", updatedAt: at };
  }
  if (kind === "run_completed") {
    return { ...next, state: "complete", updatedAt: at };
  }
  return next;
}

export function loadSynthesisAgentRun(threadId) {
  if (typeof window === "undefined" || !threadId) return emptySynthesisAgentRun(threadId);
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(synthesisAgentRunStorageKey(threadId)) || "null");
    if (!parsed || String(parsed.threadId || "") !== String(threadId) || !Array.isArray(parsed.steps)) {
      return emptySynthesisAgentRun(threadId);
    }
    return {
      ...emptySynthesisAgentRun(threadId),
      ...parsed,
      state: parsed.state === "running" ? "complete" : parsed.state,
      steps: parsed.steps.map(normalizeStep).filter(Boolean).slice(-MAX_ACTIVE_STEPS),
      history: (Array.isArray(parsed.history) ? parsed.history : [])
        .map((run) => normalizeArchivedRun(run, threadId))
        .filter(Boolean)
        .slice(-MAX_HISTORY_RUNS),
    };
  } catch {
    return emptySynthesisAgentRun(threadId);
  }
}

export function persistSynthesisAgentRun(run) {
  if (typeof window === "undefined" || !run?.threadId || !run?.id) return;
  try {
    window.sessionStorage.setItem(synthesisAgentRunStorageKey(run.threadId), JSON.stringify(run));
  } catch {
    // Observability must never block research work if browser storage is unavailable.
  }
}

export function emitSynthesisAgentEvent(threadId, detail = {}) {
  if (!threadId) return;
  const eventDetail = {
    threadId: String(threadId),
    at: Date.now(),
    ...detail,
  };
  if (typeof window !== "undefined") {
    const current = loadSynthesisAgentRun(threadId);
    persistSynthesisAgentRun(reduceSynthesisAgentRun(current, eventDetail));
  }
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent(SYNTHESIS_AGENT_ACTIVITY_EVENT, { detail: eventDetail }));
  }
}
