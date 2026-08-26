from pathlib import Path

path = Path('e2e/v2-synthesis.spec.js')
text = path.read_text()
original = text


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    text = text.replace(old, new, 1)

# Reusable explicit navigation: Synthesis now intentionally opens on workspace home.
replace_once(
'''async function capture(page, name) {\n  mkdirSync(renderDir, { recursive: true });\n  await page.screenshot({ path: `${renderDir}/${name}.png`, fullPage: true });\n}\n''',
'''async function capture(page, name) {\n  mkdirSync(renderDir, { recursive: true });\n  await page.screenshot({ path: `${renderDir}/${name}.png`, fullPage: true });\n}\n\nasync function selectThread(page, label) {\n  await page.getByTestId("synthesis-thread-item").filter({ hasText: label }).click();\n}\n''',
'add selectThread helper',
)

replace_once(
'''    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });\n    await waitForShell(page);\n\n    const workflow = page.getByRole("list", { name: "Synthesis workflow" });\n    await expect(workflow).toContainText("Define");\n    await expect(workflow).toContainText("Map evidence");\n    await expect(workflow).toContainText("Reason");\n    await expect(workflow).toContainText("Approve");\n''',
'''    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });\n    await waitForShell(page);\n    await selectThread(page, "Historical stablecoin attention");\n\n    const workflow = page.getByRole("list", { name: "Synthesis project stages" });\n    await expect(workflow).toContainText("Define");\n    await expect(workflow).toContainText("Ground");\n    await expect(workflow).toContainText("Review");\n    await expect(workflow).toContainText("Build");\n    await expect(workflow).toContainText("Reuse");\n''',
'unverified workflow contract',
)

# Fresh runtime observation test: enter the durable thread before looking for thread actions.
needle = '''  test("an open Synthesis page enables reasoning after a fresh runtime observation", async ({ page }) => {'''
start = text.index(needle)
segment = text[start:text.index('  test("collapses a long live brief', start)]
old = '''    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });\n    await waitForShell(page);\n\n    const action = page\n'''
if segment.count(old) != 1:
    raise SystemExit(f'fresh runtime navigation: expected 1 local match, found {segment.count(old)}')
segment = segment.replace(old, '''    await page.goto("/?tab=synthesis", { waitUntil: "domcontentloaded" });\n    await waitForShell(page);\n    await selectThread(page, "Historical stablecoin attention");\n\n    const action = page\n''', 1)
text = text[:start] + segment + text[text.index('  test("collapses a long live brief', start):]

replace_once(
'''  test("sends the selected durable thread to the shared Ask rail", async ({ page }) => {\n    await page.getByRole("button", { name: "Discuss construction in Ask" }).click();\n''',
'''  test("sends the selected durable thread to the shared Ask rail", async ({ page }) => {\n    await selectThread(page, "Historical stablecoin attention");\n    await page.getByRole("button", { name: "Discuss construction in Ask" }).click();\n''',
'ask rail explicit selection',
)

replace_once(
'''  test("starts reviewable method reasoning from an empty construction", async ({ page }) => {''',
'''  test("starts reviewable method reasoning from a grounded construction", async ({ page }) => {''',
'rename grounded reasoning test',
)
replace_once(
'''    await page.route("**/api/library/chat/stream", proposalReply);\n    await page.route("**/api/library/chat", proposalReply);\n\n    await page.getByRole("button", { name: "Start method reasoning" }).click();\n''',
'''    await page.route("**/api/library/chat/stream", proposalReply);\n    await page.route("**/api/library/chat", proposalReply);\n\n    await selectThread(page, "Historical stablecoin attention");\n    await page.getByRole("button", { name: "Start method reasoning" }).click();\n''',
'grounded reasoning explicit selection',
)

# The next proposal-refresh test has the same chat route pair but must enter the thread before Discuss.
needle = '''  test("refreshes the canvas in the same Ask turn that records a proposal", async ({ page }) => {'''
start = text.index(needle)
end = text.index('  test("creates a durable thread quietly', start)
segment = text[start:end]
old = '''    await page.route("**/api/library/chat/stream", proposalReply);\n    await page.route("**/api/library/chat", proposalReply);\n\n    await page.getByRole("button", { name: "Discuss construction in Ask" }).click();\n'''
if segment.count(old) != 1:
    raise SystemExit(f'proposal refresh selection: expected 1 local match, found {segment.count(old)}')
segment = segment.replace(old, '''    await page.route("**/api/library/chat/stream", proposalReply);\n    await page.route("**/api/library/chat", proposalReply);\n\n    await selectThread(page, "Historical stablecoin attention");\n    await page.getByRole("button", { name: "Discuss construction in Ask" }).click();\n''', 1)
text = text[:start] + segment + text[end:]

replace_once(
'''    await expect(page.getByText("No method exists yet.")).toBeVisible();\n''',
'''    await expect(page.getByText(/Nothing is built here\./)).toBeVisible();\n''',
'new construction copy',
)

# Both evidence-handoff tests reload into workspace home; explicitly re-enter the modified thread.
for label in ('Regulatory filings', 'Restricted vendor API'):
    marker = f'await page.getByRole("button", {{ name: /{label}/ }}).click();'
    idx = text.index(marker)
    prefix = text[:idx]
    old = '''    await page.reload({ waitUntil: "domcontentloaded" });\n    await waitForShell(page);\n\n'''
    pos = prefix.rfind(old)
    if pos < 0:
        raise SystemExit(f'{label}: reload block not found')
    text = text[:pos] + '''    await page.reload({ waitUntil: "domcontentloaded" });\n    await waitForShell(page);\n    await selectThread(page, "Historical stablecoin attention");\n\n''' + text[pos + len(old):]

replace_once(
'''    // The desktop thread list is intentionally hidden on a narrow screen;\n    // select the same durable thread through the mobile picker a researcher\n    // can actually use.\n    await page.getByRole("combobox", { name: "Choose Synthesis thread" }).selectOption({\n      label: "Weekly trust panel",\n    });\n''',
'''    // Mobile enters the proposal from the same workspace-home decision card a\n    // researcher sees; once selected, the compact thread picker becomes available.\n    await page.getByRole("button", { name: /Weekly trust panel.*Review proposal/ }).first().click();\n    await expect(page.getByRole("combobox", { name: "Choose Synthesis thread" })).toHaveValue("thread-proposal");\n''',
'mobile proposal navigation',
)

replace_once(
'''    await expect(page.getByTestId("synthesis-join-intersection")).toBeVisible();\n''',
'''    await expect(page.getByTestId("synthesis-join-overlap-visual")).toBeVisible();\n''',
'join visual test id',
)

replace_once(
'''    await expect(page.getByTestId("synthesis-opening-rail")).toContainText(\n      "2 mapped inputs · 5 columns profiled · no assistant involved",\n    );\n    expect(renderErrors, "measured state must not feed selection back into an infinite render loop").toEqual([]);\n    await expect(page.getByTestId("synthesis-opening-rail")).toContainText(\n      "1 look-ahead column could leak future information",\n    );\n''',
'''    const openingRail = page.getByTestId("synthesis-opening-rail");\n    await expect(openingRail).toContainText("Evidence");\n    await expect(openingRail).toContainText("2 mapped");\n    await expect(openingRail).toContainText("Measured");\n    await expect(openingRail).toContainText("5 columns");\n    await expect(openingRail).toContainText("Method");\n    await expect(openingRail).toContainText("Not accepted");\n    await expect(openingRail).toContainText("Output");\n    await expect(openingRail).toContainText("Not registered");\n    expect(renderErrors, "measured state must not feed selection back into an infinite render loop").toEqual([]);\n''',
'structured measured rail contract',
)

if text == original:
    raise SystemExit('no changes produced')
path.write_text(text)
print('updated', path)
