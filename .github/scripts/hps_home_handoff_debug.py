from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Instrument the runtime-patched App navigation path. This script is diagnostic
# only and runs after the convergence patches; it never lands in production.
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
text = text.replace(old_sync, new_sync, 1)
app.write_text(text)

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
    if (line.startsWith("HPS_NAV_")) {
      navTrace.push(line);
      console.log(line);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.stack || error?.message || error));
    console.log("HPS_HOME_PAGEERROR", pageErrors[pageErrors.length - 1]);
  });
  await pick.getByRole("button", { name: "Continue" }).click();
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
print("Home handoff navigation trace instrumentation applied")
