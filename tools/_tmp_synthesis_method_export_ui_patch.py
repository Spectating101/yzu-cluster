from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)

# API: exact frozen method retrieval.
rel = "drive/src/v2/api.js"
s = read(rel)
s = replace_once(
    s,
    '''export function synthesisMaterialisation(threadId) {
  return fetchJson(`/library/synthesis/threads/${encodeURIComponent(threadId)}/materialisation`);
}
''',
    '''export function synthesisMaterialisation(threadId) {
  return fetchJson(`/library/synthesis/threads/${encodeURIComponent(threadId)}/materialisation`);
}

/** Exact immutable method artifact written by the completed Synthesis execution.
 * This endpoint never asks the assistant to regenerate code. */
export function getSynthesisMethodExport(threadId) {
  return fetchJson(`/library/synthesis/threads/${encodeURIComponent(threadId)}/method`);
}
''',
    "api method export",
)
write(rel, s)

# Synthesis finished state: direct View/Download, never Ask.
rel = "drive/src/v2/SynthesisPage.jsx"
s = read(rel)
s = replace_once(
    s,
    '''  getSynthesisMeasurements,
  getSynthesisThread,
  listSynthesisProfiles,''',
    '''  getSynthesisMeasurements,
  getSynthesisMethodExport,
  getSynthesisThread,
  downloadText,
  listSynthesisProfiles,''',
    "SynthesisPage imports",
)
component = r'''
function MethodExportActions({ thread }) {
  const [method, setMethod] = useState(null);
  const [loadingMethod, setLoadingMethod] = useState(false);
  const [methodError, setMethodError] = useState("");
  const [showCode, setShowCode] = useState(false);

  const loadMethod = useCallback(async () => {
    if (method?.script) return method;
    if (!thread?.id) throw new Error("No finalized Synthesis thread is selected.");
    setLoadingMethod(true);
    setMethodError("");
    try {
      const payload = await getSynthesisMethodExport(thread.id);
      if (!payload?.script || !payload?.sha256) {
        throw new Error("The completed execution did not return a verified method artifact.");
      }
      if (payload.deterministic_export !== true || payload.generated_by_llm !== false) {
        throw new Error("The method endpoint did not prove deterministic export semantics.");
      }
      setMethod(payload);
      return payload;
    } catch (cause) {
      setMethodError(text(cause?.message, "The exact method artifact could not be loaded."));
      throw cause;
    } finally {
      setLoadingMethod(false);
    }
  }, [method, thread?.id]);

  const viewMethod = useCallback(async () => {
    if (showCode && method?.script) {
      setShowCode(false);
      return;
    }
    try {
      await loadMethod();
      setShowCode(true);
    } catch {
      // Error is rendered in the finalized record; do not fall back to Ask.
    }
  }, [loadMethod, method?.script, showCode]);

  const downloadMethod = useCallback(async () => {
    try {
      const payload = await loadMethod();
      downloadText(payload.filename || "method.py", payload.script, "text/x-python;charset=utf-8");
    } catch {
      // Same honest error surface as View; never synthesize replacement code.
    }
  }, [loadMethod]);

  const origin = method?.method_origin || {};
  const composerOrigin = origin.authority === "composer" && origin.tool === "research_synthesis_propose_state";

  return (
    <section className="s04-reproduce" data-testid="synthesis-method-export">
      <header>
        <div>
          <small>Reproduce</small>
          <strong>Exact method artifact</strong>
        </div>
        <em>Frozen with execution</em>
      </header>
      <p>
        The method is reviewable as runnable Python, not reconstructed from prose. The script is the exact
        deterministic artifact archived with this execution.
      </p>
      <div className="s04-reproduce-chain" aria-label="Method provenance chain">
        <span>{composerOrigin ? "Composer proposal" : method ? "Proposal origin not recorded" : "Proposal"}</span>
        <b aria-hidden="true">→</b>
        <span>Researcher accepted</span>
        <b aria-hidden="true">→</b>
        <span>Deterministic script</span>
      </div>
      {method ? (
        <dl>
          <div><dt>Method SHA-256</dt><dd>{softIdentifier(method.sha256)}</dd></div>
          <div><dt>Accepted spec</dt><dd>{softIdentifier(method.spec_hash)}</dd></div>
          <div><dt>Code generation</dt><dd>No LLM regeneration</dd></div>
        </dl>
      ) : null}
      {methodError ? <p className="s04-fixture">{methodError}</p> : null}
      <div className="s04-reproduce-actions">
        <button type="button" className="rd-v2-btn" disabled={loadingMethod} onClick={viewMethod}>
          {showCode ? "Hide exact method.py" : loadingMethod ? "Loading method…" : "View exact method.py"}
        </button>
        <button type="button" className="rd-v2-btn" disabled={loadingMethod} onClick={downloadMethod}>
          Download Python script
        </button>
      </div>
      {showCode && method?.script ? (
        <details open className="s04-reproduce-code">
          <summary>{method.filename || "method.py"} · SHA-256 verified</summary>
          <pre className="s04-code" data-testid="synthesis-method-export-code">{method.script}</pre>
        </details>
      ) : null}
    </section>
  );
}

'''
s = replace_once(s, "function ExecutionRecord({ thread, busy, onRequest, onReview, onAsk, onOpenDataset }) {", component + "function ExecutionRecord({ thread, busy, onRequest, onReview, onAsk, onOpenDataset }) {", "method export component")
s = replace_once(
    s,
    '''      {failed ? <p className="s04-fixture">{text(execution.error, "The execution failed without a recorded error detail.")}</p> : null}
      <footer className="s04-actions">''',
    '''      {failed ? <p className="s04-fixture">{text(execution.error, "The execution failed without a recorded error detail.")}</p> : null}
      {registered ? <MethodExportActions thread={thread} /> : null}
      <footer className="s04-actions">''',
    "render method export on finalized state",
)
write(rel, s)

# Styling: compact, readable final-state evidence surface.
rel = "drive/src/v2/s04-opening.css"
s = read(rel)
css = r'''

/* Finalized Synthesis outputs expose the exact archived method without routing
 * through Ask. This is an evidence surface, so code remains readable and the
 * provenance chain is explicit rather than decorative. */
.s04-reproduce {
  margin-top: 14px;
  padding: 14px 16px 16px;
  border: 1px solid #dce2eb;
  border-radius: 14px;
  background: #fbfcfe;
}

.s04-reproduce > header,
.s04-reproduce-actions,
.s04-reproduce-chain {
  display: flex;
  align-items: center;
  gap: 10px;
}

.s04-reproduce > header {
  justify-content: space-between;
}

.s04-reproduce > header div {
  display: grid;
  gap: 2px;
}

.s04-reproduce > header small,
.s04-reproduce dt {
  color: #68748a;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: .075em;
  text-transform: uppercase;
}

.s04-reproduce > header strong {
  color: #1f2a3d;
  font-size: 12px;
}

.s04-reproduce > header em {
  color: #37654b;
  font-size: 10px;
  font-style: normal;
  font-weight: 750;
}

.s04-reproduce > p {
  max-width: 78ch;
  margin: 9px 0 10px;
  color: #46536a;
  font-size: 11px;
  line-height: 1.55;
}

.s04-reproduce-chain {
  flex-wrap: wrap;
  margin: 8px 0 12px;
  color: #334056;
  font-size: 10.5px;
  font-weight: 700;
}

.s04-reproduce-chain b { color: #8a94a6; }

.s04-reproduce > dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0 0 12px;
}

.s04-reproduce > dl > div {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid #e3e7ee;
  border-radius: 10px;
  background: #fff;
}

.s04-reproduce dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  color: #263248;
  font-size: 10.5px;
  line-height: 1.35;
}

.s04-reproduce-actions {
  flex-wrap: wrap;
}

.s04-reproduce-code {
  margin-top: 12px;
}

.s04-reproduce-code summary {
  cursor: pointer;
  color: #46536a;
  font-size: 10px;
  font-weight: 750;
}

.s04-reproduce-code .s04-code {
  max-height: 380px;
  margin-top: 8px;
  overflow: auto;
  font-size: 10.5px;
  line-height: 1.5;
}

@media (max-width: 720px) {
  .s04-reproduce > dl { grid-template-columns: 1fr; }
  .s04-reproduce > header { align-items: flex-start; }
}
'''
if ".s04-reproduce {" in s:
    raise SystemExit("reproduce CSS already exists")
s += css
write(rel, s)

# Browser fixture: direct method endpoint with provenance metadata.
rel = "e2e/v2-synthesis.spec.js"
s = read(rel)
s = replace_once(
    s,
    '''    if (suffix === "materialisation" && method === "GET") {
      const execution = thread.state.execution || {};''',
    '''    if (suffix === "method" && method === "GET") {
      const execution = thread.state.execution || {};
      if (!['registered', 'query_ready'].includes(String(execution.status || ''))) {
        return respond({ error: "method export requires completed execution" }, 409);
      }
      return respond({
        thread_id: thread.id,
        job_id: execution.job_id,
        filename: "method.py",
        script: `\"\"\"Reproduces the exact accepted Synthesis method.\"\"\"\n# execution_spec sha256: sha256:accepted-weekly-v1\nimport pandas as pd\nframe = pd.DataFrame({ value: [1, 2] })\nresult = frame.groupby(lambda _x: 0).size().rename('n').to_frame().reset_index(drop=True)\nresult.to_parquet('stablecoin_attention_weekly.parquet', index=False)\n`,
        sha256: "89b58e264fed4df14ef399432b446ccc7977f4bdfe02b13b221a0ff3cc3f51a1",
        spec_hash: "sha256:accepted-weekly-v1",
        method_origin: {
          kind: "llm_tool_call",
          authority: "composer",
          tool: "research_synthesis_propose_state",
          proposal_id: "proposal-weekly-v1",
          proposal_hash: "sha256:proposal-weekly-v1",
        },
        deterministic_export: true,
        generated_by_llm: false,
      });
    }
    if (suffix === "materialisation" && method === "GET") {
      const execution = thread.state.execution || {};''',
    "mock method endpoint",
)
# Add high-value direct export test immediately after registered output test.
anchor = '''  test("renders query-ready only from an explicit query-ready lifecycle", async ({ page }) => {'''
test = r'''  test("finalized output exposes the exact frozen method without asking the LLM to regenerate code", async ({ page }) => {
    let chatCalls = 0;
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/library/chat") || path.endsWith("/library/chat/stream")) chatCalls += 1;
    });

    await page.getByTestId("synthesis-thread-item").filter({ hasText: "Stablecoin attention weekly panel" }).click();
    const registered = page.getByTestId("synthesis-registered-state");
    const reproduce = registered.getByTestId("synthesis-method-export");
    await expect(reproduce).toBeVisible();
    await expect(reproduce).toContainText("Exact method artifact");
    await expect(reproduce).toContainText("Frozen with execution");

    await reproduce.getByRole("button", { name: "View exact method.py" }).click();
    await expect(reproduce).toContainText("Composer proposal");
    await expect(reproduce).toContainText("Researcher accepted");
    await expect(reproduce).toContainText("Deterministic script");
    await expect(reproduce).toContainText("No LLM regeneration");
    const code = reproduce.getByTestId("synthesis-method-export-code");
    await expect(code).toContainText("execution_spec sha256");
    await expect(code).toContainText("result.to_parquet");
    expect(chatCalls, "viewing the authoritative script must not call Ask/LLM").toBe(0);

    const downloadPromise = page.waitForEvent("download");
    await reproduce.getByRole("button", { name: "Download Python script" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("method.py");
    expect(chatCalls, "downloading the authoritative script must not call Ask/LLM").toBe(0);
    await capture(page, "04b-registered-method-export-desktop");
  });

'''
if anchor not in s:
    raise SystemExit("registered test anchor not found")
s = s.replace(anchor, test + anchor, 1)
write(rel, s)

print("Synthesis finalized method export UI patch applied")
