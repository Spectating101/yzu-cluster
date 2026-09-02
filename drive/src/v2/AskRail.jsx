import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { GuidedState, ProgressSteps } from "@/v2/InteractionFeedback";
import { useAskChat } from "@/v2/useAskChat";
import { handleEnterToSubmit } from "@/v2/enterToSubmit";
import { formatAskText } from "@/v2/askText.jsx";
import { AskAgentCard } from "@/v2/AskAgentCard.jsx";
import { displayName } from "@/v2/datasetMeta";
import { DISCOVER_TAB } from "@/v2/tabIdentity";
import { decideSynthesisProposal, requestSynthesisExecution } from "@/v2/api";
import {
  SYNTHESIS_AUTOMATION_MODES,
  synthesisAutomationAllowsApproval,
  synthesisAutomationAllowsChoice,
  synthesisAutomationOption,
  useSynthesisAutomationMode,
} from "@/v2/synthesisAutomation.js";

const AUTOMATABLE_REASONING_DECISIONS = new Set([
  "resolve_scope",
  "resolve_units",
  "resolve_join",
  "review_recommendation",
  "design_method",
]);

function synthesisAutomationPrompt(selected = {}) {
  const decision = String(selected.current_decision || "the current Synthesis decision").trim();
  const risk = String(selected.decision_risk || "No additional recorded risk").trim();
  const next = String(selected.decision_next || "Advance only if the recorded evidence supports one defensible construction").trim();
  return {
    prompt: [
      "Synthesis Autopilot is allowed to resolve supported method decisions for this durable thread.",
      `Current decision: ${decision}.`,
      `Recorded risk: ${risk}.`,
      `Expected next boundary: ${next}.`,
      "Use only the recorded research object, held evidence, deterministic measurements, and source/documentation evidence available to this thread.",
      "If one construction is defensible, choose it, state the research consequence, and record one exact reviewable Synthesis proposal that incorporates that choice.",
      "If the evidence does not establish one defensible choice, stop and ask the researcher instead of guessing.",
      "Do not collect evidence, invent measurements, accept your own proposal, approve execution, or register an output in this turn.",
    ].join(" "),
    displayText: `Autopilot · ${decision}`,
  };
}

function automationStateKey(selected = {}, mode = "manual") {
  return [
    selected.thread_id || "",
    selected.decision_kind || "",
    selected.proposal_hash || "",
    selected.accepted_spec_hash || "",
    selected.preview_status || "",
    selected.preview_spec_hash || "",
    selected.execution_status || "",
    selected.job_id || "",
    mode,
  ].join(":");
}

export function AskRail({
  dataset,
  mainTab,
  searchQuery,
  pendingMessage,
  onPendingConsumed,
  onCollected,
  onSynthesisChanged,
  onApproveJob,
  onToast,
  railContext,
}) {
  const { messages, input, setInput, busy, status, send, contextLabel } = useAskChat({
    dataset,
    railContext,
    onCollected,
    onSynthesisChanged,
    onToast,
  });
  const pendingSentRef = useRef("");
  const textareaRef = useRef(null);
  const automationActionRef = useRef("");
  const [approvalState, setApprovalState] = useState({});
  const [automationState, setAutomationState] = useState("");
  const [automationMode] = useSynthesisAutomationMode();

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

  const ctxParts = [contextLabel, mainTab, searchQuery ? `search: ${searchQuery}` : ""].filter(Boolean);
  const isProfile = mainTab === "profile";
  const isSettings = mainTab === "settings";
  const isDiscover = mainTab === DISCOVER_TAB;
  const isLibrary = mainTab === "library";
  const isDiscoverHistory = isDiscover && dataset?.kind === "discover_history";
  const isDiscoverInvestigation = isDiscover && dataset?.kind === "discover_investigation";
  const isSynthesis = mainTab === "synthesis";
  const profileContext = dataset?.title || "Profile";
  const synthesisContext =
    dataset?.title && dataset.title !== "Synthesis studio"
      ? dataset.title
      : "Synthesis studio";
  const synthesisSelected = isSynthesis ? railContext?.selected || {} : {};
  const synthesisStageLabel = String(
    synthesisSelected.synthesis_stage_label || synthesisSelected.synthesis_stage || "",
  ).trim();
  const synthesisDecision = String(synthesisSelected.current_decision || "").trim();
  const synthesisPrompts = Array.isArray(synthesisSelected.synthesis_ask_prompts)
    ? synthesisSelected.synthesis_ask_prompts.filter(Boolean).slice(0, 4)
    : [];
  const automationOption = synthesisAutomationOption(automationMode);
  const hasThread = messages.length > 0;
  const discoverTitle = dataset?.title || dataset?.dataset_id || "";
  const railTitle = isProfile
    ? "Ask"
    : isSettings
      ? "Ask · desk setup"
    : isDiscoverHistory
      ? "Ask · lifecycle item"
      : isDiscoverInvestigation
        ? "Ask · investigation"
      : isDiscover
        ? "Ask · selected source"
        : isSynthesis
          ? synthesisStageLabel
            ? `Ask · ${synthesisStageLabel}`
            : "Ask · synthesis thread"
          : isLibrary
            ? "Ask · Library"
            : "Procurement chat";
  const railSubtitle = isProfile
    ? hasThread
      ? `Continuing · context → ${profileContext}`
      : `Context · ${profileContext}`
    : isSettings
      ? "Context · desk preferences and connection state"
    : isDiscoverHistory && discoverTitle
      ? `Lifecycle context · ${discoverTitle}`
      : isDiscoverInvestigation && discoverTitle
        ? hasThread
          ? `Continuing · investigation → ${discoverTitle}`
          : `Investigation · ${discoverTitle}`
      : isDiscover && discoverTitle && hasThread
        ? `Selected context · ${discoverTitle}`
        : isDiscover && discoverTitle
          ? `Evaluating · ${discoverTitle}`
          : isSynthesis
            ? hasThread
              ? `Continuing · ${synthesisStageLabel || "thread"} → ${synthesisContext}`
              : `${synthesisStageLabel || "Thread context"} · ${synthesisContext}`
            : isLibrary
              ? searchQuery
                ? `Search context · ${searchQuery}`
                : "Context · held research evidence"
              : ctxParts.length
                ? ctxParts.join(" · ")
                : "Select a dataset for grounded answers";

  const askEntityTitle =
    (dataset?.dataset_id || dataset?.title
      ? displayName(dataset) || dataset?.title || dataset?.dataset_id
      : "") ||
    (isProfile ? profileContext : isSynthesis ? synthesisContext : "");

  useEffect(() => {
    if (!isSynthesis || !synthesisSelected.thread_id) {
      automationActionRef.current = "";
      setAutomationState("");
      return;
    }
    if (automationMode === SYNTHESIS_AUTOMATION_MODES.MANUAL || busy || pendingMessage) {
      if (automationMode === SYNTHESIS_AUTOMATION_MODES.MANUAL) setAutomationState("");
      return;
    }

    const selected = synthesisSelected;
    const decisionKind = String(selected.decision_kind || "");
    const actionKey = automationStateKey(selected, automationMode);
    if (!actionKey || automationActionRef.current === actionKey) return;

    const run = async () => {
      automationActionRef.current = actionKey;
      const threadId = String(selected.thread_id || "");

      try {
        if (synthesisAutomationAllowsChoice(automationMode) && AUTOMATABLE_REASONING_DECISIONS.has(decisionKind)) {
          setAutomationState("Reasoning through the current method decision…");
          await send(synthesisAutomationPrompt(selected));
          setAutomationState("Waiting for the durable thread to record the reasoning result.");
          return;
        }

        if (synthesisAutomationAllowsApproval(automationMode) && decisionKind === "review_proposal") {
          if (!selected.proposal_id || !selected.proposal_hash) {
            setAutomationState("Paused · proposal identity is not fully recorded.");
            return;
          }
          setAutomationState("Accepting the exact proposal and running bounded Preview…");
          const accepted = await decideSynthesisProposal(threadId, {
            decision: "accept",
            proposalId: selected.proposal_id,
            proposalHash: selected.proposal_hash,
          });
          if (accepted?.state?.execution_spec) {
            await requestSynthesisExecution(threadId, { action: "preview" });
          }
          onSynthesisChanged?.({ threadId, automation: "proposal_accepted" });
          onToast?.("Autopilot accepted the method and ran bounded Preview");
          setAutomationState("Method accepted · checking Preview state…");
          return;
        }

        if (synthesisAutomationAllowsApproval(automationMode) && decisionKind === "run_preview") {
          setAutomationState("Running bounded Preview for the accepted revision…");
          await requestSynthesisExecution(threadId, { action: "preview" });
          onSynthesisChanged?.({ threadId, automation: "preview_requested" });
          setAutomationState("Preview requested · waiting for the durable receipt.");
          return;
        }

        if (synthesisAutomationAllowsApproval(automationMode) && decisionKind === "review_preview") {
          if (String(selected.preview_status || "").toLowerCase() !== "succeeded") {
            setAutomationState("Paused · current Preview is not a successful bound receipt.");
            return;
          }
          setAutomationState("Requesting execution approval for the exact Previewed revision…");
          const result = await requestSynthesisExecution(threadId, { action: "request_approval" });
          const jobId = result?.job?.id || result?.thread?.state?.execution?.job_id || "";
          if (jobId && onApproveJob) {
            setAutomationState("Approving the bound execution job…");
            await Promise.resolve(onApproveJob(jobId));
            onToast?.("Autopilot approved the bound Synthesis execution");
          } else if (jobId) {
            setAutomationState("Paused · execution approval permission is unavailable.");
          } else {
            setAutomationState("Execution approval requested · waiting for the durable job record.");
          }
          onSynthesisChanged?.({ threadId, automation: "execution_requested" });
          return;
        }

        if (synthesisAutomationAllowsApproval(automationMode) && decisionKind === "approve_execution") {
          const jobId = String(selected.job_id || "");
          if (!jobId || !onApproveJob) {
            setAutomationState("Paused · the bound approval job or permission is unavailable.");
            return;
          }
          setAutomationState("Approving the already-bound execution job…");
          await Promise.resolve(onApproveJob(jobId));
          onSynthesisChanged?.({ threadId, automation: "execution_approved" });
          onToast?.("Autopilot approved the bound Synthesis execution");
          setAutomationState("Execution approved · worker lifecycle is now authoritative.");
          return;
        }

        if (decisionKind === "map_evidence") {
          setAutomationState("Paused at evidence review · held inputs still require explicit selection.");
          return;
        }
        if (decisionKind === "recover_preview") {
          setAutomationState("Paused at failed Preview · inspect the failure before retrying.");
          return;
        }
        if (["recover_build", "approve_execution"].includes(decisionKind)) {
          setAutomationState("Paused at a researcher or recovery boundary.");
          return;
        }
        if (["await_registration", "inspect_result", "inspect_registered_result"].includes(decisionKind)) {
          setAutomationState("Automation complete for the current authority path.");
          return;
        }
        setAutomationState("");
      } catch (error) {
        setAutomationState(`Paused · ${String(error?.message || "automation could not advance")}`);
        onToast?.(error?.message || "Synthesis Autopilot paused", "error");
      }
    };

    run();
  }, [
    automationMode,
    busy,
    isSynthesis,
    onApproveJob,
    onSynthesisChanged,
    onToast,
    pendingMessage,
    send,
    synthesisSelected,
  ]);

  return (
    <div className="rd-v2-ask-shell">
      <header className="rd-v2-ask-head">
        <p className="rd-v2-ask-head-eyebrow">{railTitle}</p>
        <strong>{askEntityTitle || "Ask"}</strong>
        <p className="rd-v2-ask-ctx">{railSubtitle}</p>
      </header>
      {isSynthesis && automationMode !== SYNTHESIS_AUTOMATION_MODES.MANUAL ? (
        <p
          className={`rd-v2-synthesis-auto-note${automationState && !automationState.startsWith("Paused") ? " is-working" : ""}`}
          data-testid="synthesis-automation-status"
          title={automationOption.detail}
        >
          <b>{automationOption.label}</b>
          <span>{automationState || automationOption.detail}</span>
        </p>
      ) : null}
      <div className="rd-v2-ask-messages" data-testid="ask-messages" aria-busy={busy}>
        {messages.length === 0 ? (
          isProfile ? (
            <div className="rd-v2-ask-placeholder">
              <p>
                Ask how the saved research memory shapes Discover and Synthesis, or correct context that the desk
                should stop carrying forward.
              </p>
              <div className="rd-v2-chips-row rd-v2-ask-chips">
                {[
                  "What research context do you remember?",
                  "How does this profile affect Discover?",
                  "Which assumptions should I correct?",
                ].map((p) => (
                  <button key={p} type="button" className="rd-v2-chip clickable" disabled={busy} onClick={() => send(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : isSettings ? (
            <div className="rd-v2-ask-placeholder">
              <p>
                Ask what the current desk settings change, which connections are available, and where approval or
                readiness boundaries still apply.
              </p>
              <div className="rd-v2-chips-row rd-v2-ask-chips">
                {[
                  "Explain the current desk setup.",
                  "Which settings affect approvals?",
                  "What remains unconnected?",
                ].map((p) => (
                  <button key={p} type="button" className="rd-v2-chip clickable" disabled={busy} onClick={() => send(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : isDiscoverHistory && discoverTitle ? (
            <div className="rd-v2-ask-placeholder">
              <p>
                This lifecycle record stays in context. Ask about its durable state, evidence, uncertainty, or the
                safest next action without upgrading a status claim.
              </p>
              <div className="rd-v2-chips-row rd-v2-ask-chips">
                {[
                  `Explain the current state of ${discoverTitle}`,
                  `What remains unverified for ${discoverTitle}?`,
                  `What is the safest next action for ${discoverTitle}?`,
                ].map((p) => (
                  <button key={p} type="button" className="rd-v2-chip clickable" disabled={busy} onClick={() => send(p)}>
                    {String(p).slice(0, 42)}
                  </button>
                ))}
              </div>
            </div>
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
                  `Compare ${discoverTitle} with my Library holdings`,
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
          ) : isLibrary ? (
            <div className="rd-v2-ask-placeholder" data-testid="library-ask-guidance">
              <p>
                Ask what evidence you already hold, why a result matches, how holdings compare, or what is genuinely missing. Library answers must keep held evidence separate from Discover candidates.
              </p>
              <div className="rd-v2-chips-row rd-v2-ask-chips">
                {[
                  searchQuery ? `Explain the best matches for ${searchQuery}` : "What evidence do I have?",
                  "Which held assets overlap?",
                  "What evidence is still missing?",
                ].map((p) => (
                  <button key={p} type="button" className="rd-v2-chip clickable" disabled={busy} onClick={() => send(p)}>
                    {String(p).length > 48 ? `${String(p).slice(0, 45)}…` : p}
                  </button>
                ))}
              </div>
            </div>
          ) : isSynthesis ? (
            <div className="rd-v2-ask-placeholder" data-testid="synthesis-ask-guidance">
              <p>
                {synthesisDecision
                  ? automationMode === SYNTHESIS_AUTOMATION_MODES.MANUAL
                    ? `Current decision: ${synthesisDecision}. Ask stays bound to this durable thread and cannot silently advance its authority state.`
                    : `Current decision: ${synthesisDecision}. ${automationOption.label} is active; the agent may advance only the authority granted by that mode and must stop at unsupported evidence or recovery boundaries.`
                  : "This conversation shares the active Synthesis thread. Ask can interpret, challenge, or propose a reviewable next step without silently advancing the construction."}
              </p>
              <div className="rd-v2-chips-row rd-v2-ask-chips">
                {(synthesisPrompts.length
                  ? synthesisPrompts
                  : [
                      "Explain the current construction.",
                      "Challenge the main assumption.",
                      "What is the next defensible research decision?",
                    ]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="rd-v2-chip clickable"
                    disabled={busy}
                    onClick={() => send(p)}
                    title={p}
                  >
                    {String(p).length > 54 ? `${String(p).slice(0, 51)}…` : p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <GuidedState
              className="rd-v2-ask-guided-empty"
              eyebrow="Grounded assistant"
              title="Ask from an active research context"
              detail="Research Drive can search holdings, inspect evidence, propose collection, and explain what remains uncertain."
              checks={[
                "Visible context stays attached to the conversation",
                "Material collection still requires the appropriate approval path",
                "Readiness claims remain evidence-bound",
              ]}
            />
          )
        ) : (
          <>
            {isDiscoverHistory ? (
              <p className="rd-v2-ask-context-notice" data-testid="ask-context-notice">
                New messages use this lifecycle context.
              </p>
            ) : isDiscover && discoverTitle ? (
              <p className="rd-v2-ask-context-notice" data-testid="ask-context-notice">
                New messages use this source context.
              </p>
            ) : isSynthesis ? (
              <p className="rd-v2-ask-context-notice" data-testid="ask-context-notice">
                New messages use this Synthesis thread{ synthesisStageLabel ? ` at ${synthesisStageLabel}` : "" } and its current accepted state.
              </p>
            ) : null}
            {messages.map((m, i) => {
              if (m.streaming && !m.text) {
                return (
                  <AskAgentCard
                    key={`assistant-stream-${i}`}
                    message={m}
                    busy={busy}
                  />
                );
              }
              const approval = m.pendingJobId ? approvalState[m.pendingJobId]?.status : "";
              if (m.role === "assistant") {
                return (
                  <AskAgentCard
                    key={`assistant-${i}`}
                    message={m}
                    busy={busy}
                    approval={approval}
                    onSend={send}
                    onApprove={requestApproval}
                  />
                );
              }
              return (
                <div
                  key={`${m.role}-${i}`}
                  className={`rd-v2-ask-bubble${m.role === "error" ? " error" : ""}${m.role === "notice" ? " notice" : ""}`}
                >
                  <span className="rd-v2-ask-bubble-role">
                    {m.role === "error" ? "Error" : m.role === "notice" ? "Read-only review" : "You"}
                  </span>
                  <div className="rd-v2-ask-bubble-text">{formatAskText(m.text)}</div>
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
              ? "Correct the research memory or ask how it is used…"
              : isSettings
                ? "Ask about desk behavior, access, or approvals…"
              : isSynthesis
                ? synthesisDecision
                  ? `Ask about ${synthesisDecision.toLowerCase()}…`
                  : "Correct the interpretation, add a constraint, or ask…"
                : isDiscoverHistory
                  ? "Ask about this lifecycle record…"
                  : "Ask about coverage, overlaps, or procurement…"
          }
          disabled={busy}
          data-testid="ask-composer"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            handleEnterToSubmit(e, () => {
              if (!busy && input.trim()) send();
            });
          }}
        />
        <div className="rd-v2-ask-send-row">
          <span className="rd-v2-ask-send-hint">Enter to send · ⇧↵ newline</span>
          <button
            type="button"
            className="rd-v2-btn sm primary"
            disabled={busy || !input.trim()}
            aria-busy={busy}
            onClick={() => send()}
          >
            {busy ? <><LoaderCircle className="rd-v2-inline-spinner" aria-hidden="true" /> Working…</> : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
