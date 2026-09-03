import { useCallback, useEffect, useRef, useState } from "react";
import {
  getChatSession,
  linkSynthesisThreadConversation,
  sendChatMessage,
} from "@/v2/api";
import { normalizeActivityStep } from "@/v2/deskIntegration";
import { clearChatSessionId, loadChatSessionId, loadUserEmail, saveChatSessionId } from "@/v2/deskSession";
import { classifyAskIntent, shapeAskReplyForIntent } from "@/v2/askIntent";
import { emitSynthesisAgentEvent } from "@/v2/synthesisAgentRun.js";

function normalizeOutgoingMessage(value, fallback = "") {
  const raw = value ?? fallback;
  if (raw && typeof raw === "object") {
    const prompt = String(raw.prompt || raw.text || "").trim();
    const displayText = String(raw.displayText || raw.label || prompt).trim();
    return { prompt, displayText };
  }
  const prompt = String(raw || "").trim();
  return { prompt, displayText: prompt };
}

function restoredDisplayText(row) {
  let value = String(row?.content || row?.text || "");
  if (row?.role !== "user") return value;

  // Stored prompts retain the machine context that grounded the provider turn.
  // The researcher already sees that context in the selected rail/canvas, so
  // replay only the message they actually authored.
  value = value.replace(/^\[context:[^\n]*?\]\s*/i, "");
  value = value.split(/\n\nSynthesis thread:/i)[0];
  value = value.split(/\n\nSynthesis workspace context\./i)[0];
  return value.trim();
}

function restoreMessage(row) {
  const artifacts = row?.artifacts && typeof row.artifacts === "object" ? row.artifacts : {};
  return {
    role: row?.role === "assistant" ? "assistant" : row?.role === "error" ? "error" : "user",
    text: restoredDisplayText(row),
    action: artifacts.action,
    toolName: artifacts.tool_name,
    candidates: Array.isArray(artifacts.candidates) ? artifacts.candidates : [],
    suggestedPrompts: Array.isArray(artifacts.suggestions) ? artifacts.suggestions : [],
    nextSteps: Array.isArray(artifacts.next_steps) ? artifacts.next_steps : [],
    pendingJobId: artifacts.job_id || artifacts.pending_job_id || null,
    jobStatus: artifacts.job_status || artifacts.job?.status,
  };
}

function contextPart(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 240);
}

/**
 * Durable Ask identity. The visible rail can change without changing React
 * component identity, so conversation ownership must be explicit rather than
 * inferred from whether the component remounted.
 */
export function askContextKey(dataset = null, railContext = null) {
  const kind = contextPart(dataset?.kind || railContext?.entity?.kind || "general") || "general";
  if (kind === "synthesis_thread") {
    return `synthesis:${contextPart(dataset?.thread_id || railContext?.entity?.id || dataset?.id || dataset?.title) || "thread"}`;
  }

  const candidate = contextPart(
    dataset?.candidate_key ||
      dataset?.row?.candidate_key ||
      railContext?.selected?.candidate_key,
  );
  if (candidate) return `candidate:${candidate}`;

  const datasetId = contextPart(dataset?.dataset_id || railContext?.dataset_id);
  if (datasetId) return `dataset:${datasetId}`;

  const entityId = contextPart(railContext?.entity?.id || dataset?.id);
  if (entityId) return `${kind}:${entityId}`;

  const investigation = contextPart(
    dataset?.search_query ||
      dataset?.question ||
      (kind === "discover_investigation" ? dataset?.title : "") ||
      railContext?.search_query,
  );
  if (investigation) return `${kind}:${investigation}`;

  const title = contextPart(dataset?.title || railContext?.entity?.title);
  if (title) return `${kind}:${title}`;
  return "general";
}

export function useAskChat({ dataset, railContext, onCollected, onSynthesisChanged, onToast } = {}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const sessionRef = useRef("");
  const railRef = useRef(railContext);
  const contextRef = useRef(askContextKey(dataset, railContext));
  const busyRef = useRef(false);
  const requestEpochRef = useRef(0);
  const synthesisThreadId =
    dataset?.kind === "synthesis_thread" ? String(dataset.thread_id || "") : "";
  const synthesisSessionId =
    dataset?.kind === "synthesis_thread" ? String(dataset.session_id || "") : "";
  const contextKey = askContextKey(dataset, railContext);

  useEffect(() => {
    railRef.current = railContext;
  }, [railContext]);

  useEffect(() => {
    let cancelled = false;
    contextRef.current = contextKey;
    // Changing research object logically cancels the old rail request. The HTTP
    // turn may still finish, but its epoch can no longer write into this view or
    // release a newer request's busy lock.
    requestEpochRef.current += 1;
    busyRef.current = false;
    setBusy(false);
    setMessages([]);
    setInput("");
    setStatus("");

    const targetSessionId = synthesisThreadId
      ? synthesisSessionId
      : loadChatSessionId(contextKey);
    sessionRef.current = targetSessionId;
    if (!targetSessionId) {
      return () => {
        cancelled = true;
      };
    }

    getChatSession(targetSessionId)
      .then((session) => {
        if (cancelled || contextRef.current !== contextKey) return;
        const rows = Array.isArray(session?.messages) ? session.messages : [];
        setMessages(rows.map(restoreMessage));
      })
      .catch(() => {
        if (!cancelled && contextRef.current === contextKey) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [contextKey, synthesisThreadId, synthesisSessionId]);

  const contextPrefix = dataset?.dataset_id
    ? `[context: ${dataset.dataset_id}] `
    : dataset?.title
      ? `[context: ${dataset.title}] `
      : "";

  const send = useCallback(
    async (text) => {
      const outgoing = normalizeOutgoingMessage(text, input);
      const prompt = outgoing.prompt;
      if (!prompt || busyRef.current) return;
      const sendContextKey = contextKey;
      const sendSynthesisThreadId = synthesisThreadId;
      const sendSynthesisSessionId = synthesisSessionId;
      const requestEpoch = requestEpochRef.current + 1;
      requestEpochRef.current = requestEpoch;
      const isCurrentRequest = () =>
        contextRef.current === sendContextKey && requestEpochRef.current === requestEpoch;
      busyRef.current = true;
      const intent = classifyAskIntent(outgoing.displayText || prompt);
      const full =
        contextPrefix && !prompt.startsWith("[context:")
          ? `${contextPrefix}${prompt}`
          : prompt;
      const initialActivity = intent === "status" ? "Checking status…" : "Planning response…";

      setMessages((m) => [...m, { role: "user", text: outgoing.displayText, intent }]);
      setInput("");
      setBusy(true);
      setStatus(initialActivity);
      emitSynthesisAgentEvent(sendSynthesisThreadId, {
        kind: "run_started",
        text: initialActivity,
        intent,
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "",
          streaming: true,
          intent,
          activity: initialActivity,
          activityLog:
            intent === "status"
              ? []
              : [{ phase: "planning", text: "Planning response…", at: Date.now() }],
        },
      ]);

      try {
        const out = await sendChatMessage(full, {
          sessionId: sessionRef.current,
          userEmail: loadUserEmail(),
          railContext: railRef.current,
          onDelta: (chunk) => {
            if (!isCurrentRequest()) return;
            setStatus("");
            setMessages((m) =>
              m.map((item) =>
                item.streaming ? { ...item, text: `${item.text || ""}${chunk}` } : item,
              ),
            );
          },
          onActivity: (event) => {
            if (!isCurrentRequest()) return;
            if (intent === "status") {
              setStatus("Checking status…");
              return;
            }
            const line =
              event && typeof event === "object" ? String(event.text || "") : String(event || "");
            setStatus(line);
            emitSynthesisAgentEvent(sendSynthesisThreadId, {
              kind: "activity",
              text: line,
              action: event && typeof event === "object" ? event.action || null : null,
              elapsedSeconds: event && typeof event === "object" ? event.elapsed_seconds : undefined,
            });
            setMessages((m) =>
              m.map((item) =>
                item.streaming
                  ? {
                      ...item,
                      activity: line,
                      activityLog: normalizeActivityStep(event, item.activityLog || []),
                    }
                  : item,
              ),
            );
          },
        });

        if (out.session_id) {
          if (sendSynthesisThreadId) {
            if (out.session_id !== sendSynthesisSessionId) {
              linkSynthesisThreadConversation(sendSynthesisThreadId, {
                sessionId: out.session_id,
              }).catch(() => {});
            }
          } else {
            saveChatSessionId(out.session_id, sendContextKey);
          }
          if (isCurrentRequest()) {
            sessionRef.current = out.session_id;
          }
        }
        const reply = out.reply || out.message || "Done.";
        const artifacts = out.artifacts || {};
        const recordedProposal =
          artifacts.synthesis_proposal ||
          out.synthesis_proposal ||
          (artifacts.proposal_recorded ? { recorded: true } : null);
        if (sendSynthesisThreadId && recordedProposal) {
          onSynthesisChanged?.({
            threadId: artifacts.synthesis_thread_id || sendSynthesisThreadId,
            proposal: recordedProposal,
          });
        }
        const statePatch = artifacts.state_patch || out.state_patch || {};
        // Stuck Composer resume targets poison only the context that produced
        // them. Never clear another research object's resumable conversation.
        const composerBroken =
          out.action === "composer_error" ||
          artifacts.action === "composer_error" ||
          /could not complete that turn|composer session expired|internal:\s*internal error/i.test(
            String(reply || ""),
          );
        if (composerBroken && !sendSynthesisThreadId) {
          clearChatSessionId(sendContextKey);
          if (isCurrentRequest()) sessionRef.current = "";
        }
        const pendingJobId =
          artifacts.job?.id || statePatch.pending_job_id || out.pending_job_id || null;
        const jobStatus = artifacts.job?.status || statePatch.job_status;
        const toolName = artifacts.tool_name || out.tool_name || null;
        const nextSteps = Array.isArray(out.next_steps)
          ? out.next_steps
          : Array.isArray(artifacts.next_steps)
            ? artifacts.next_steps
            : [];
        const shaped = shapeAskReplyForIntent(intent, {
          action: out.action,
          toolName,
          candidates: out.candidates || artifacts.candidates || [],
          suggestedPrompts: out.suggested_prompts || artifacts.suggestions || [],
          nextSteps,
          pendingJobId,
          jobStatus,
        });

        if (isCurrentRequest()) {
          setMessages((m) => {
            const trimmed = m.filter((x) => !x.streaming);
            return [
              ...trimmed,
              {
                role: "assistant",
                text: reply,
                intent,
                action: shaped.action,
                toolName: shaped.toolName,
                // Completed turns should not keep "Planning…" chrome in the card.
                activityLog: [],
                candidates: shaped.candidates || [],
                suggestedPrompts: shaped.suggestedPrompts || [],
                nextSteps: shaped.nextSteps || nextSteps || [],
                pendingJobId: shaped.pendingJobId,
                jobStatus: shaped.jobStatus,
              },
            ];
          });
          setStatus(
            intent === "status"
              ? ""
              : out.campaign_id
                ? `Campaign ${String(out.campaign_id).slice(0, 8)}…`
                : "",
          );
          emitSynthesisAgentEvent(sendSynthesisThreadId, {
            kind: "run_completed",
            action: out.action || shaped.action || null,
          });
        }
        if (
          intent !== "status" &&
          ["collect", "acquire", "collect_doi", "approve_collect", "queue", "schedule_refresh"].includes(
            out.action,
          )
        ) {
          onCollected?.();
          onToast?.(
            out.action === "schedule_refresh"
              ? "Refresh registered in Discover History"
              : "Queued for collection",
          );
        }
        const subId =
          artifacts.subscription_id ||
          artifacts.subscription?.id ||
          out.subscription_id ||
          null;
        if (intent !== "status" && (subId || out.action === "schedule_refresh")) {
          onCollected?.();
          if (out.action !== "schedule_refresh") {
            onToast?.("Refresh registered in Discover History");
          }
        }
        if (intent !== "status" && shaped.pendingJobId && shaped.jobStatus === "pending_approval") {
          onToast?.("Job pending approval — use Approve below");
        }
      } catch (err) {
        const msg = err.message || String(err);
        const readOnlyReview = /review endpoint does not allow desk mutations|read[- ]only.*review/i.test(msg);
        if (/composer|internal:\s*internal error|could not complete/i.test(msg) && !sendSynthesisThreadId) {
          clearChatSessionId(sendContextKey);
          if (isCurrentRequest()) sessionRef.current = "";
        }
        if (isCurrentRequest()) {
          setMessages((m) => [
            ...m.filter((x) => !x.streaming),
            {
              role: readOnlyReview ? "notice" : "error",
              text: readOnlyReview
                ? "Ask is unavailable on this read-only review build. The question and visible results remain intact."
                : msg,
            },
          ]);
          setStatus(readOnlyReview ? "Read-only review" : (msg || "Chat failed"));
          emitSynthesisAgentEvent(sendSynthesisThreadId, {
            kind: "run_failed",
            text: readOnlyReview ? "Read-only review" : (msg || "Chat failed"),
          });
        }
      } finally {
        if (isCurrentRequest()) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [
      contextKey,
      contextPrefix,
      input,
      onCollected,
      onSynthesisChanged,
      onToast,
      synthesisSessionId,
      synthesisThreadId,
    ],
  );

  return {
    messages,
    input,
    setInput,
    busy,
    status,
    send,
    contextLabel:
      dataset?.kind === "external_candidate"
        ? dataset.title || dataset.row?.dataset_id || dataset.id || null
        : dataset?.dataset_id || dataset?.title || null,
  };
}
