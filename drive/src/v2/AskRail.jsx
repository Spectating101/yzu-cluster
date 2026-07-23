import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { GuidedState, ProgressSteps } from "@/v2/InteractionFeedback";
import { useAskChat } from "@/v2/useAskChat";
import { isInternalValidationRecord } from "@/v2/productVisibility";

function pageLabel(mainTab) {
  const labels = {
    browse: "Discover",
    library: "Library",
    synthesis: "Synthesis",
    resources: "Resources",
    home: "Home",
    profile: "Profile",
    settings: "Settings",
  };
  return labels[mainTab] || "Research Drive";
}

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
  const scopedDataset = mainTab === "home" && isInternalValidationRecord(dataset) ? null : dataset;
  const { messages, input, setInput, busy, status, send, contextLabel } = useAskChat({
    dataset: scopedDataset,
    railContext,
    onCollected,
    onToast,
  });
  const pendingSentRef = useRef("");
  const textareaRef = useRef(null);
  const [approvalState, setApprovalState] = useState({});

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

  const requestApproval = async (jobId) => {
    if (!jobId || approvalState[jobId]?.status === "working") return;
    setApprovalState((current) => ({ ...current, [jobId]: { status: "working" } }));
    try {
      await Promise.resolve(onApproveJob?.(jobId));
    } finally {
      setApprovalState((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
    }
  };

  const page = pageLabel(mainTab);
  const isProfile = mainTab === "profile";
  const isDiscover = mainTab === "browse";
  const isDiscoverHistory = isDiscover && scopedDataset?.kind === "discover_history";
  const isSynthesis = mainTab === "synthesis";
  const discoverTitle = scopedDataset?.title || scopedDataset?.dataset_id || "";
  const synthesisContext =
    scopedDataset?.title && scopedDataset.title !== "Synthesis studio"
      ? scopedDataset.title
      : railContext?.entity?.title || "Current synthesis thread";
  const objectTitle =
    contextLabel ||
    railContext?.entity?.title ||
    railContext?.selected?.title ||
    (searchQuery ? `Search · ${searchQuery}` : "No object selected");
  const railTitle = isDiscoverHistory
    ? "Ask · lifecycle item"
    : isDiscover
      ? "Ask · source context"
      : isSynthesis
        ? "Ask · construction"
        : "Ask";
  const scopeLabel = `${page} · ${objectTitle}`;

  return (
    <div className="rd-v2-ask-shell">
      <header className="rd-v2-ask-head rd-rc3-ask-head">
        <strong>{railTitle}</strong>
        <p className="rd-v2-ask-ctx">Context · {scopeLabel}</p>
        <div className="rd-rc3-ask-scope" aria-label="Ask context">
          <span>{page}</span>
          <b>{objectTitle}</b>
        </div>
      </header>
      <div className="rd-v2-ask-messages" data-testid="ask-messages" aria-busy={busy}>
        {messages.length === 0 ? (
          isProfile ? (
            <p className="rd-v2-ask-placeholder rd-v2-ask-placeholder-quiet" />
          ) : isDiscoverHistory && discoverTitle ? (
            <div className="rd-v2-ask-placeholder">
              <p>
                This lifecycle record is the active object. Ask about durable state, evidence, uncertainty, or the safest next action without upgrading a status claim.
              </p>
              <div className="rd-v2-chips-row rd-v2-ask-chips">
                {[
                  `Explain the current state of ${discoverTitle}`,
                  `What remains unverified for ${discoverTitle}?`,
                  `What is the safest next action for ${discoverTitle}?`,
                ].map((prompt) => (
                  <button key={prompt} type="button" className="rd-v2-chip clickable" disabled={busy} onClick={() => send(prompt)}>
                    {String(prompt).slice(0, 42)}
                  </button>
                ))}
              </div>
            </div>
          ) : isDiscover && discoverTitle ? (
            <div className="rd-v2-ask-placeholder">
              <p>
                The selected source remains in context. Ask about research fit, risks, lab overlap, access, or what evidence to probe next.
              </p>
              <div className="rd-v2-chips-row rd-v2-ask-chips">
                {[
                  `Assess this source: ${discoverTitle}`,
                  `What are the main risks of ${discoverTitle}?`,
                  `Compare ${discoverTitle} with my lab holdings`,
                  `What should I probe next for ${discoverTitle}?`,
                ].map((prompt) => (
                  <button key={prompt} type="button" className="rd-v2-chip clickable" disabled={busy} onClick={() => send(prompt)}>
                    {String(prompt).slice(0, 42)}
                  </button>
                ))}
              </div>
            </div>
          ) : isSynthesis ? (
            <div className="rd-v2-ask-placeholder">
              <p>
                This conversation is isolated to {synthesisContext}. Challenge interpretation, add constraints, compare constructions, or investigate missing evidence.
              </p>
              <div className="rd-v2-chips-row rd-v2-ask-chips">
                {[
                  "Explain the current construction.",
                  "Challenge the main assumption.",
                  "Which evidence is still missing?",
                ].map((prompt) => (
                  <button key={prompt} type="button" className="rd-v2-chip clickable" disabled={busy} onClick={() => send(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <GuidedState
              className="rd-v2-ask-guided-empty"
              eyebrow="Context-bound assistant"
              title="Ask from the active research object"
              detail="Research Drive can inspect evidence, challenge interpretation, investigate missing sources, and explain what remains uncertain."
              checks={[
                "Conversation history is isolated by active object",
                "Material collection still requires its approval path",
                "Readiness claims remain evidence-bound",
              ]}
            />
          )
        ) : (
          <>
            <p className="rd-v2-ask-context-notice" data-testid="ask-context-notice">
              New messages use {scopeLabel}. Other object conversations remain separate.
            </p>
            {messages.map((message, index) => {
              if (message.streaming && !message.text) return null;
              const approval = message.pendingJobId ? approvalState[message.pendingJobId]?.status : "";
              return (
                <div
                  key={`${message.role}-${index}`}
                  className={`rd-v2-ask-bubble${message.role === "assistant" ? " agent" : ""}${message.role === "error" ? " error" : ""}`}
                >
                  {message.role === "user" ? (
                    <><strong>You:</strong> {message.text}</>
                  ) : message.role === "error" ? (
                    message.text
                  ) : (
                    <>
                      {!message.streaming && message.activityLog?.length ? (
                        <ol className="rd-v2-ask-phases" data-testid="ask-tool-phases" aria-label="Agent tool activity">
                          {message.activityLog.map((step, stepIndex) => (
                            <li key={`${step.phase}-${stepIndex}`} data-phase={step.phase}>
                              <span className="rd-v2-ask-phase-label">{step.phase}</span>
                              <span className="rd-v2-ask-phase-text">{step.text}</span>
                            </li>
                          ))}
                        </ol>
                      ) : !message.streaming && message.activity ? (
                        <p className="muted small">{message.activity}</p>
                      ) : null}
                      <strong>Agent:</strong> {message.text}
                      {message.action || message.toolName ? (
                        <p className="rd-v2-ask-action-meta muted small">
                          {[message.toolName, message.action].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                      {message.pendingJobId && message.jobStatus === "pending_approval" ? (
                        <div className="rd-v2-ask-actions">
                          <button
                            type="button"
                            className="rd-v2-btn sm primary"
                            disabled={busy || approval === "working"}
                            aria-busy={approval === "working"}
                            onClick={() => requestApproval(message.pendingJobId)}
                          >
                            {approval === "working" ? <><LoaderCircle className="rd-v2-inline-spinner" aria-hidden="true" /> Approving…</> : "Approve job"}
                          </button>
                        </div>
                      ) : null}
                      {message.suggestedPrompts?.length ? (
                        <div className="rd-v2-chips-row rd-v2-ask-chips">
                          {message.suggestedPrompts.slice(0, 3).map((prompt) => (
                            <button key={prompt} type="button" className="rd-v2-chip clickable" disabled={busy} onClick={() => send(prompt)}>
                              {String(prompt).slice(0, 40)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
      <ProgressSteps active={busy} activeText={status} label="Research assistant progress" />
      {!busy && status ? <p className="rd-v2-ask-status">{status}</p> : null}
      <div className="rd-v2-ask-input">
        <textarea
          ref={textareaRef}
          value={input}
          rows={3}
          placeholder={
            isProfile
              ? "Message…"
              : isSynthesis
                ? "Challenge, revise, or investigate this construction…"
                : isDiscoverHistory
                  ? "Ask about this lifecycle record…"
                  : isDiscover
                    ? "Ask about this source or evidence gap…"
                    : "Ask about the active research object…"
          }
          disabled={busy}
          data-testid="ask-composer"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="rd-v2-ask-send-row">
          <span className="rd-v2-ask-send-hint">⌘↵ to send</span>
          <button type="button" className="rd-v2-btn sm primary" disabled={busy || !input.trim()} aria-busy={busy} onClick={() => send()}>
            {busy ? <><LoaderCircle className="rd-v2-inline-spinner" aria-hidden="true" /> Working…</> : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
