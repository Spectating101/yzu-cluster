import { useCallback, useEffect, useRef, useState } from "react";
import { deskWarm, getChatSession, sendChatMessage } from "@/v2/api";
import { loadChatSessionId, loadUserEmail } from "@/v2/deskSession";

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

function messagesFromSessionPayload(payload) {
  const rows = Array.isArray(payload?.messages) ? payload.messages : [];
  return rows
    .map((row) => {
      const role = String(row?.role || "").trim();
      const text = String(row?.content || row?.text || "").trim();
      if (!role || !text) return null;
      if (role !== "user" && role !== "assistant" && role !== "error") return null;
      return { role, text };
    })
    .filter(Boolean);
}

function knownSessionId(railContext) {
  const linked = String(railContext?.session_id || "").trim();
  if (linked) return linked;
  // A synthesis thread starts its own Composer conversation on its first turn.
  // It must not inherit unrelated desk chat history before that link exists.
  if (railContext?.thread_id) return "";
  return String(loadChatSessionId() || "").trim();
}

export function useAskChat({ dataset, railContext, onCollected, onToast, onSessionId, onSynthesisProposal } = {}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const sessionRef = useRef(knownSessionId(railContext));
  const warmStartedRef = useRef(false);
  const railRef = useRef(railContext);
  const onSessionIdRef = useRef(onSessionId);
  const onSynthesisProposalRef = useRef(onSynthesisProposal);
  const restoredSessionRef = useRef("");
  const restoreGenRef = useRef(0);
  const completionPollRef = useRef(0);

  useEffect(() => {
    railRef.current = railContext;
  }, [railContext]);

  useEffect(() => {
    onSessionIdRef.current = onSessionId;
  }, [onSessionId]);

  useEffect(() => {
    onSynthesisProposalRef.current = onSynthesisProposal;
  }, [onSynthesisProposal]);

  useEffect(() => {
    if (warmStartedRef.current) return;
    warmStartedRef.current = true;
    deskWarm({
      sessionId: sessionRef.current,
      userEmail: loadUserEmail(),
      background: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const sid = knownSessionId(railContext);
    if (!sid) {
      if (railContext?.thread_id) {
        restoredSessionRef.current = "";
        sessionRef.current = "";
        setMessages([]);
      }
      return;
    }
    if (restoredSessionRef.current === sid) {
      sessionRef.current = sid;
      return;
    }
    const gen = ++restoreGenRef.current;
    restoredSessionRef.current = sid;
    sessionRef.current = sid;
    getChatSession(sid)
      .then((payload) => {
        if (gen !== restoreGenRef.current) return;
        const restored = messagesFromSessionPayload(payload);
        if (restored.length) setMessages(restored);
      })
      .catch(() => {
        // Preserve local rail state when the chat backend is unavailable.
        if (gen === restoreGenRef.current && restoredSessionRef.current === sid) {
          restoredSessionRef.current = "";
        }
      });
  }, [railContext?.session_id, railContext?.thread_id]);

  const watchComposerCompletion = useCallback((sessionId) => {
    const sid = String(sessionId || "").trim();
    const threadId = String(railRef.current?.thread_id || "").trim();
    if (!sid) return;
    const token = ++completionPollRef.current;
    let attempts = 0;
    const poll = async () => {
      if (token !== completionPollRef.current) return;
      attempts += 1;
      try {
        const payload = await getChatSession(sid);
        const rawMessages = Array.isArray(payload?.messages) ? payload.messages : [];
        const lastAssistant = [...rawMessages].reverse().find((row) => row?.role === "assistant");
        const stillWorking = Boolean(lastAssistant?.artifacts?.still_working);
        if (lastAssistant && !stillWorking && rawMessages.length > 2) {
          setMessages(messagesFromSessionPayload(payload));
          if (threadId) onSynthesisProposalRef.current?.({ threadId, background: true });
          return;
        }
      } catch {
        // The pending reply remains visible when the session service is temporarily unavailable.
      }
      if (attempts < 60 && token === completionPollRef.current) {
        window.setTimeout(poll, 3000);
      }
    };
    window.setTimeout(poll, 3000);
  }, []);

  const contextPrefix = dataset?.dataset_id
    ? `[context: ${dataset.dataset_id}] `
    : dataset?.title
      ? `[context: ${dataset.title}] `
      : "";

  const send = useCallback(
    async (text) => {
      const outgoing = normalizeOutgoingMessage(text, input);
      const prompt = outgoing.prompt;
      if (!prompt || busy) return;
      const full = contextPrefix && !prompt.startsWith("[context:")
        ? `${contextPrefix}${prompt}`
        : prompt;

      setMessages((m) => [...m, { role: "user", text: outgoing.displayText }]);
      setInput("");
      setBusy(true);
      setStatus("Planning response…");
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "", streaming: true, activity: "Planning response…" },
      ]);

      try {
        const out = await sendChatMessage(full, {
          sessionId: sessionRef.current,
          userEmail: loadUserEmail(),
          railContext: railRef.current,
          onDelta: (chunk) => {
            setStatus("");
            setMessages((m) =>
              m.map((item) =>
                item.streaming
                  ? { ...item, text: `${item.text || ""}${chunk}`, activity: "" }
                  : item,
              ),
            );
          },
          onActivity: (line) => {
            setStatus(line);
            setMessages((m) =>
              m.map((item) => (item.streaming ? { ...item, activity: line } : item)),
            );
          },
        });

        if (out.session_id) {
          sessionRef.current = out.session_id;
          restoredSessionRef.current = out.session_id;
          onSessionIdRef.current?.(out.session_id, out);
        }
        const reply = out.reply || out.message || "Done.";
        const artifacts = out.artifacts || {};
        const statePatch = artifacts.state_patch || out.state_patch || {};
        const synthesisProposal = artifacts.synthesis_proposal || out.synthesis_proposal || null;
        const synthesisThreadId = String(
          artifacts.synthesis_thread_id || out.synthesis_thread_id || railRef.current?.thread_id || "",
        ).trim();
        const pendingJobId =
          artifacts.job?.id || statePatch.pending_job_id || out.pending_job_id || null;
        const jobStatus = artifacts.job?.status || statePatch.job_status;

        setMessages((m) => {
          const trimmed = m.filter((x) => !x.streaming);
          return [
            ...trimmed,
            {
              role: "assistant",
              text: reply,
              action: out.action,
              candidates: out.candidates || artifacts.candidates || [],
              suggestedPrompts: out.suggested_prompts || artifacts.suggestions || [],
              pendingJobId,
              jobStatus,
            },
          ];
        });
        setStatus(out.campaign_id ? `Campaign ${String(out.campaign_id).slice(0, 8)}…` : "");
        if (["collect", "acquire", "collect_doi", "approve_collect", "queue"].includes(out.action)) {
          onCollected?.();
          onToast?.("Queued for collection");
        }
        if (pendingJobId && jobStatus === "pending_approval") {
          onToast?.("Job pending approval — use Approve below");
        }
        if (synthesisProposal && synthesisThreadId) {
          onSynthesisProposal?.({ threadId: synthesisThreadId, proposal: synthesisProposal });
          onToast?.("Construction proposal ready for review");
        }
        if (out.action === "composer_pending" || artifacts.still_working) {
          watchComposerCompletion(out.session_id || sessionRef.current);
        }
      } catch (err) {
        setMessages((m) => [
          ...m.filter((x) => !x.streaming),
          { role: "error", text: err.message || String(err) },
        ]);
        setStatus(err.message || "Chat failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, contextPrefix, input, onCollected, onToast, onSynthesisProposal, watchComposerCompletion],
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
