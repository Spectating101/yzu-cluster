from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Diagnostic-only runtime trace. None of these console statements are landed.
app = ROOT / "drive/src/v2/App.jsx"
text = app.read_text()
old_go = '''  const goTab = useCallback(
    (id, opts = {}) => {
      const next = normalizeReleaseTab(canonicalTab(id));'''
new_go = '''  const goTab = useCallback(
    (id, opts = {}) => {
      const next = normalizeReleaseTab(canonicalTab(id));
      console.log("HPS_NAV_GOTAB", JSON.stringify({ id, next, current: tab, opts }));'''
if text.count(old_go) != 1:
    raise SystemExit(f"expected one goTab anchor, found {text.count(old_go)}")
text = text.replace(old_go, new_go, 1)
old_sync = '''  const syncUrl = useCallback(
    (patch) => {
      const nextTab = canonicalTab(patch.tab ?? tab);'''
new_sync = '''  const syncUrl = useCallback(
    (patch) => {
      const nextTab = canonicalTab(patch.tab ?? tab);
      console.log("HPS_NAV_SYNC", JSON.stringify({ patch, current: tab, nextTab }));'''
if text.count(old_sync) != 1:
    raise SystemExit(f"expected one syncUrl anchor, found {text.count(old_sync)}")
app.write_text(text.replace(old_sync, new_sync, 1))

home = ROOT / "drive/src/v2/HomePage.jsx"
text = home.read_text()
old_continue = '''  const continuePrimary = (point) => {
    if (point?.thread?.id) {'''
new_continue = '''  const continuePrimary = (point) => {
    console.log("HPS_HOME_HANDLER_CONTINUE", JSON.stringify({ kind: point?.kind, action: point?.action, id: point?.id, tab: point?.tab, thread: point?.thread?.id || "" }));
    if (point?.thread?.id) {'''
if text.count(old_continue) != 1:
    raise SystemExit(f"expected one continuePrimary anchor, found {text.count(old_continue)}")
text = text.replace(old_continue, new_continue, 1)
old_review = '''  const reviewDecision = (point) => {
    if (onOpenAttention) {'''
new_review = '''  const reviewDecision = (point) => {
    console.log("HPS_HOME_HANDLER_REVIEW", JSON.stringify({ kind: point?.kind, action: point?.action, id: point?.id, tab: point?.tab }));
    if (onOpenAttention) {'''
if text.count(old_review) != 1:
    raise SystemExit(f"expected one reviewDecision anchor, found {text.count(old_review)}")
home.write_text(text.replace(old_review, new_review, 1))

spec = ROOT / "e2e/hps-functional-convergence.spec.js"
text = spec.read_text()
old = '''  await expect(pick).toContainText(/Proposal review/i);
  await pick.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("synthesis-studio")).toBeVisible();'''
new = '''  await expect(pick).toContainText(/Proposal review/i);
  const pageErrors = [];
  const navTrace = [];
  page.on("console", (message) => {
    const line = message.text();
    if (line.startsWith("HPS_NAV_") || line.startsWith("HPS_HOME_HANDLER_")) {
      navTrace.push(line);
      console.log(line);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.stack || error?.message || error));
    console.log("HPS_HOME_PAGEERROR", pageErrors[pageErrors.length - 1]);
  });
  const continueButton = pick.getByRole("button", { name: "Continue" });
  const hit = await continueButton.evaluate((button) => {
    const r = button.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const target = document.elementFromPoint(x, y);
    const chain = [];
    let node = target;
    for (let i = 0; node && i < 5; i += 1, node = node.parentElement) {
      chain.push({ tag: node.tagName, cls: node.className || "", text: (node.textContent || "").trim().slice(0, 120) });
    }
    return { button: { x: r.x, y: r.y, width: r.width, height: r.height }, point: { x, y }, target: chain };
  });
  console.log("HPS_HOME_HIT_TARGET", JSON.stringify(hit));
  await continueButton.click();
  await page.waitForTimeout(300);
  console.log("HPS_HOME_POST_CLICK", JSON.stringify({
    url: page.url(),
    homeVisible: await page.getByTestId("home-continue").isVisible().catch(() => false),
    synthesisVisible: await page.getByTestId("synthesis-studio").isVisible().catch(() => false),
    pageErrors,
    navTrace,
  }));
  await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe("synthesis");
  expect(pageErrors).toEqual([]);

  await expect(page.getByTestId("synthesis-studio")).toBeVisible();'''
if text.count(old) != 1:
    raise SystemExit(f"expected one Home handoff anchor, found {text.count(old)}")
spec.write_text(text.replace(old, new, 1))
print("Home handoff pointer and handler trace instrumentation applied")
