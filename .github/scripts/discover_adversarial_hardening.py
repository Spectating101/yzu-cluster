from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match in {path}, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# Evidence authority: correcting a research brief invalidates every route claim
# derived from the previous assessment immediately. Generation IDs also fence a
# late source-route response so it cannot repopulate stale sourcing advice.
replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '''  const autoStartedRef = useRef("");
  const routeAutoKeyRef = useRef("");
''',
    '''  const autoStartedRef = useRef("");
  const routeAutoKeyRef = useRef("");
  const assessmentRequestSeqRef = useRef(0);
  const routeRequestSeqRef = useRef(0);
''',
    "evidence request generations",
)
replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '''  useEffect(() => {
    if (!assessmentValue) return;
    setAssessment(assessmentValue);
    setRouteResult(null);
    setRouteError("");
    routeAutoKeyRef.current = "";
  }, [assessmentValue]);
''',
    '''  useEffect(() => {
    if (!assessmentValue) return;
    routeRequestSeqRef.current += 1;
    setRouteLoading(false);
    setAssessment(assessmentValue);
    setRouteResult(null);
    setRouteError("");
    routeAutoKeyRef.current = "";
  }, [assessmentValue]);
''',
    "external assessment invalidates routes",
)
replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '''  const requestAssessment = async ({ requirement, questionOverride } = {}) => {
    const question = String(questionOverride || draft).trim();
    if (!question) return;
    setLoading(true);
    setError("");
    try {
      const next = await assessDiscoverEvidence({ question, requirement });
      setAssessment(next);
      setRouteResult(null);
      setRouteError("");
      onAssessmentChange?.(next);
      onAssessmentActive?.(true);
    } catch (requestError) {
      setError("Assessment is unavailable. Showing the catalogue instead.");
      onAssessmentChange?.(null);
      onAssessmentActive?.(false);
      // Existing catalogue search is retained only as a graceful fallback.
      onLegacySearch?.(question);
    } finally {
      setLoading(false);
    }
  };

  const requestRoutes = async () => {
    if (!assessment?.gap || assessment?.assessment_status !== "assessed" || routeLoading) return;
    setRouteLoading(true);
    setRouteError("");
    try {
      const next = await listDiscoverGapRoutes({ question: assessment.question || draft, assessment });
      setRouteResult(next || {});
    } catch (requestError) {
      setRouteResult(null);
      setRouteError("Declared routes are unavailable. The gap remains unresolved.");
    } finally {
      setRouteLoading(false);
    }
  };
''',
    '''  const requestAssessment = async ({ requirement, questionOverride } = {}) => {
    const question = String(questionOverride || draft).trim();
    if (!question) return;
    const assessmentRequestId = ++assessmentRequestSeqRef.current;
    // Any sourcing result belongs to the assessment that produced it. Retire
    // that authority synchronously before model work for a corrected brief.
    routeRequestSeqRef.current += 1;
    routeAutoKeyRef.current = "";
    setRouteResult(null);
    setRouteError("");
    setRouteLoading(false);
    setLoading(true);
    setError("");
    try {
      const next = await assessDiscoverEvidence({ question, requirement });
      if (assessmentRequestId !== assessmentRequestSeqRef.current) return;
      setAssessment(next);
      onAssessmentChange?.(next);
      onAssessmentActive?.(true);
    } catch (requestError) {
      if (assessmentRequestId !== assessmentRequestSeqRef.current) return;
      setError("Assessment is unavailable. Showing the catalogue instead.");
      onAssessmentChange?.(null);
      onAssessmentActive?.(false);
      // Existing catalogue search is retained only as a graceful fallback.
      onLegacySearch?.(question);
    } finally {
      if (assessmentRequestId === assessmentRequestSeqRef.current) setLoading(false);
    }
  };

  const requestRoutes = async () => {
    if (!assessment?.gap || assessment?.assessment_status !== "assessed" || routeLoading) return;
    const routeRequestId = ++routeRequestSeqRef.current;
    setRouteLoading(true);
    setRouteError("");
    try {
      const next = await listDiscoverGapRoutes({ question: assessment.question || draft, assessment });
      if (routeRequestId !== routeRequestSeqRef.current) return;
      setRouteResult(next || {});
    } catch (requestError) {
      if (routeRequestId !== routeRequestSeqRef.current) return;
      setRouteResult(null);
      setRouteError("Declared routes are unavailable. The gap remains unresolved.");
    } finally {
      if (routeRequestId === routeRequestSeqRef.current) setRouteLoading(false);
    }
  };
''',
    "assessment and route request fencing",
)

# Capacity authority: App intentionally distinguishes undefined (still checking),
# object (measured), and null (unavailable). Do not erase that distinction with
# a default value, and never make decision-relevant capacity silently disappear.
replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '''  assessmentValue = null,
  resourcesRollup = null,
  deskHealth = null,
''',
    '''  assessmentValue = null,
  resourcesRollup,
  deskHealth = null,
''',
    "preserve resources rollup tri-state",
)
replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '''  const capacityRows = useMemo(
    () => buildDiscoverDecisionCapacity(resourcesRollup, deskHealth, { routes: routeRows }),
    [resourcesRollup, deskHealth, routeResult],
  );
''',
    '''  const capacityRows = useMemo(
    () => buildDiscoverDecisionCapacity(resourcesRollup, deskHealth, { routes: routeRows }),
    [resourcesRollup, deskHealth, routeResult],
  );
  const capacityState = resourcesRollup === undefined
    ? "checking"
    : resourcesRollup === null
      ? "unavailable"
      : capacityRows.length
        ? "measured"
        : "unreported";
''',
    "capacity truth state",
)
replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '''          {variant === "workspace" && capacityRows.length ? (
            <section className="rd-v2-evidence-capacity" aria-label="Execution capacity">
              <div className="rd-v2-evidence-section-head">
                <div><span className="rd-v2-eyebrow">Execution capacity</span><p>Measured desk capability that can change the sourcing decision. No worker or quota is assigned here.</p></div>
              </div>
              <div className="rd-v2-evidence-capacity-grid">
                {capacityRows.map((row) => (
                  <div key={row.id} className={row.attention ? "needs-attention" : ""}>
                    <span>{row.label}</span><strong>{row.metric}</strong>{row.detail ? <em>{row.detail}</em> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
''',
    '''          {variant === "workspace" ? (
            <section className="rd-v2-evidence-capacity" aria-label="Execution capacity" data-state={capacityState}>
              <div className="rd-v2-evidence-section-head">
                <div><span className="rd-v2-eyebrow">Execution capacity</span><p>Measured desk capability that can change the sourcing decision. No worker or quota is assigned here.</p></div>
              </div>
              {capacityState === "checking" ? (
                <p className="muted" role="status">Checking measured desk capacity…</p>
              ) : capacityState === "unavailable" ? (
                <p className="muted">Measured capacity is unavailable. Do not assume compute, storage, or quota from this sourcing view.</p>
              ) : capacityRows.length ? (
                <div className="rd-v2-evidence-capacity-grid">
                  {capacityRows.map((row) => (
                    <div key={row.id} className={row.attention ? "needs-attention" : ""}>
                      <span>{row.label}</span><strong>{row.metric}</strong>{row.detail ? <em>{row.detail}</em> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No decision-relevant measured capacity was reported.</p>
              )}
            </section>
          ) : null}
''',
    "stable execution capacity surface",
)

# Acquisition authority: React busy state is presentational and may not commit
# before a second activation in the same task. A synchronous ref is the actual
# client-side idempotency lock for review, route choice, and approval submission.
replace_once(
    "drive/src/v2/DiscoverIntentWorkspace.jsx",
    'import { useMemo, useState } from "react";\n',
    'import { useMemo, useRef, useState } from "react";\n',
    "intent operation lock import",
)
replace_once(
    "drive/src/v2/DiscoverIntentWorkspace.jsx",
    '''  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
''',
    '''  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const operationLockRef = useRef(false);
''',
    "intent operation lock ref",
)
replace_once(
    "drive/src/v2/DiscoverIntentWorkspace.jsx",
    '''  const review = async (decision) => {
    if (!proposal?.id || !proposal?.proposal_hash || !intent?.id) return;
    setBusy(`review:${decision}`);
    setError("");
''',
    '''  const review = async (decision) => {
    if (!proposal?.id || !proposal?.proposal_hash || !intent?.id || operationLockRef.current) return;
    operationLockRef.current = true;
    setBusy(`review:${decision}`);
    setError("");
''',
    "review synchronous lock",
)
replace_once(
    "drive/src/v2/DiscoverIntentWorkspace.jsx",
    '''    } finally {
      setBusy("");
    }
  };

  const selectRoute = async (routeId) => {
    if (!intent?.id) return;
    setBusy(`route:${routeId}`);
''',
    '''    } finally {
      operationLockRef.current = false;
      setBusy("");
    }
  };

  const selectRoute = async (routeId) => {
    if (!intent?.id || operationLockRef.current) return;
    operationLockRef.current = true;
    setBusy(`route:${routeId}`);
''',
    "review unlock and route synchronous lock",
)
replace_once(
    "drive/src/v2/DiscoverIntentWorkspace.jsx",
    '''    } finally {
      setBusy("");
    }
  };

  const submit = async () => {
    if (!intent?.id || !canSubmitDiscoverIntent(intent)) return;
    setBusy("submit");
''',
    '''    } finally {
      operationLockRef.current = false;
      setBusy("");
    }
  };

  const submit = async () => {
    if (!intent?.id || !canSubmitDiscoverIntent(intent) || operationLockRef.current) return;
    operationLockRef.current = true;
    setBusy("submit");
''',
    "route unlock and submit synchronous lock",
)
replace_once(
    "drive/src/v2/DiscoverIntentWorkspace.jsx",
    '''    } finally {
      setBusy("");
    }
  };

  return (
''',
    '''    } finally {
      operationLockRef.current = false;
      setBusy("");
    }
  };

  return (
''',
    "submit unlock",
)

print("Applied Discover stale-route fencing, stable capacity truth states, and synchronous acquisition idempotency locks")
