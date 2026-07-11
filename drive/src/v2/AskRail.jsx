import { useEffect, useRef } from "react";
import { useAskChat } from "@/v2/useAskChat";

export function AskRail({
  dataset,
  mainTab,
  searchQuery,
  pendingMessage,
  onPendingConsumed,
  onCollected,
  onApproveJob,
  onToast,
  railContext,
}) {
  const { messages, input, setInput, busy, status, send, contextLabel } = useAskChat({
    dataset,
    railContext,
    onCollected,
    onToast,
  });
  const pendingSentRef = useRef("");
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!pendingMessage || busy) return;
    const pendingKey =
      typeof pendingMessage === "string"
        ? pendingMessage
        : `${pendingMessage.prompt || ""}::${pendingMessage.displayText || ""}`;
    if (!pendingKey || pendingSentRef.current === pendingKey) return;
    pendingSentRef.current = pendingKey;
    send(pendingMessage).finally(() => {
      pendingSentRef.current = "";
      onPendingConsumed?.();
    });
  }, [pendingMessage, busy, send, onPendingConsumed]);

  const ctxParts = [contextLabel, mainTab, searchQuery ? `search: ${searchQuery}` : ""].filter(Boolean);
  const isProfile = mainTab === "profile";
  const isDiscover = mainTab === "browse";
  const profileContext = dataset?.title || "Profile";
  const hasThread = messages.length > 0;
  const discoverTitle = dataset?.title || dataset?.dataset_id || "";

  return (
    <div className="rd-v2-ask-shell">
      <header className="rd-v2-ask-head">
        <strong>{isProfile ? "Ask" : isDiscover ? "Ask · selected source" : "Procurement chat"}</strong>
        <p className="rd-v2-ask-ctx">
          {isProfile
            ? hasThread
              ? `Continuing · context → ${profileContext}`
              : `Context · ${profileContext}`
            : isDiscover && discoverTitle && hasThread
              ? `Selected context · ${discoverTitle}`
            : isDiscover && discoverTitle
              ? `Evaluating · ${discoverTitle}`
            : ctxParts.length
              ? ctxParts.join(" · ")
              : "Select a dataset for grounded answers"}
        </p>
      </header>
      <div className="rd-v2-ask-messages" data-testid="ask-messages">
        {messages.length === 0 ? (
          isProfile ? (
            <p className="rd-v2-ask-placeholder rd-v2-ask-placeholder-quiet" />
          ) : isDiscover && discoverTitle ? (
            <div className="rd-v2-ask-placeholder">
              <p>
                Selected candidate stays in context. Ask about usability, risks, lab overlap, or what to probe next —
                without inventing clearance or completeness.
              </p>
              <div className="rd-v2-chips-row rd-v2-ask-chips">
                {[
                  `Assess this source: ${discoverTitle}`,
                  `What are the main risks of ${discoverTitle}?`,
                  `Compare ${discoverTitle} with my lab holdings`,
                  `What should I probe next for ${discoverTitle}?`,
                ].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="rd-v2-chip clickable"
                    disabled={busy}
                    onClick={() => send(p)}
                  >
                    {String(p).slice(0, 42)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="rd-v2-ask-placeholder">
              Ask about vault holdings, Hugging Face or DOI imports, overlaps, or what to procure next — the assistant
              searches, queries, collects, and archives via the research tools.
            </p>
          )
        ) : (
          <>
            {isDiscover && discoverTitle ? (
              <p className="rd-v2-ask-context-notice" data-testid="ask-context-notice">
                New messages use this source context.
              </p>
            ) : null}
            {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`rd-v2-ask-bubble${m.role === "assistant" ? " agent" : ""}${m.role === "error" ? " error" : ""}`}
            >
              {m.role === "user" ? (
                <>
                  <strong>You:</strong> {m.text}
                </>
              ) : m.role === "error" ? (
                m.text
              ) : (
                <>
                  {m.activity ? <p className="muted small">{m.activity}</p> : null}
                  <strong>Agent:</strong> {m.text || (m.streaming ? "…" : "")}
                  {m.pendingJobId && m.jobStatus === "pending_approval" ? (
                    <div className="rd-v2-ask-actions">
                      <button
                        type="button"
                        className="rd-v2-btn sm primary"
                        disabled={busy}
                        onClick={() => onApproveJob?.(m.pendingJobId)}
                      >
                        Approve job
                      </button>
                    </div>
                  ) : null}
                  {m.suggestedPrompts?.length ? (
                    <div className="rd-v2-chips-row rd-v2-ask-chips">
                      {m.suggestedPrompts.slice(0, 3).map((p) => (
                        <button
                          key={p}
                          type="button"
                          className="rd-v2-chip clickable"
                          disabled={busy}
                          onClick={() => send(p)}
                        >
                          {String(p).slice(0, 40)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ))}
          </>
        )}
      </div>
      {status ? <p className="rd-v2-ask-status">{status}</p> : null}
      <div className="rd-v2-ask-input">
        <textarea
          ref={textareaRef}
          value={input}
          rows={3}
          placeholder={isProfile ? "Message…" : "Ask about coverage, overlaps, or procurement…"}
          disabled={busy}
          data-testid="ask-composer"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="rd-v2-ask-send-row">
          <span className="rd-v2-ask-send-hint">⌘↵ to send</span>
          <button
            type="button"
            className="rd-v2-btn sm primary"
            disabled={busy || !input.trim()}
            onClick={() => send()}
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
