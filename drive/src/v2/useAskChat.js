import { useCallback, useRef, useState } from "react";
import { sendChatMessage } from "@/v2/api";
import { loadChatSessionId, loadUserEmail } from "@/v2/deskSession";

export function useAskChat({ dataset, onCollected, onToast } = {}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const sessionRef = useRef(loadChatSessionId());

  const contextPrefix = dataset?.dataset_id
    ? `[context: ${dataset.dataset_id}] `
    : dataset?.title
      ? `[context: ${dataset.title}] `
      : "";

  const send = useCallback(
    async (text) => {
      const prompt = String(text ?? input).trim();
      if (!prompt || busy) return;
      const full = contextPrefix && !prompt.startsWith("[context:")
        ? `${contextPrefix}${prompt}`
        : prompt;

      setMessages((m) => [...m, { role: "user", text: prompt }]);
      setInput("");
      setBusy(true);
      setStatus("Composer is planning…");
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "", streaming: true, activity: "Composer is planning…" },
      ]);

      try {
        const out = await sendChatMessage(full, {
          sessionId: sessionRef.current,
          userEmail: loadUserEmail(),
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

        if (out.session_id) sessionRef.current = out.session_id;
        const reply = out.reply || out.message || "Done.";
        const artifacts = out.artifacts || {};
        const statePatch = artifacts.state_patch || out.state_patch || {};
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
    [busy, contextPrefix, input, onCollected, onToast],
  );

  return {
    messages,
    input,
    setInput,
    busy,
    status,
    send,
    contextLabel: dataset?.dataset_id || dataset?.title || null,
  };
}
