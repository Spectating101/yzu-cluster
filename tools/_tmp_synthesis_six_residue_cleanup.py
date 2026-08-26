from pathlib import Path

p = Path('e2e/v2-synthesis.spec.js')
s = p.read_text()
orig = s


def replace_once(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    s = s.replace(old, new, 1)

# 1. Opening state intentionally retains its four-step pre-acceptance grammar.
replace_once(
'''    const workflow = page.getByRole("list", { name: "Synthesis project stages" });
    await expect(workflow).toContainText("Define");
    await expect(workflow).toContainText("Ground");
    await expect(workflow).toContainText("Review");
    await expect(workflow).toContainText("Build");
    await expect(workflow).toContainText("Reuse");
''',
'''    const workflow = page.getByRole("list", { name: "Synthesis workflow" });
    await expect(workflow).toContainText("Define");
    await expect(workflow).toContainText("Map evidence");
    await expect(workflow).toContainText("Reason");
    await expect(workflow).toContainText("Approve");
''',
'opening workflow grammar',
)

# 2. Ask rail is phase-aware; preserve the semantic binding rather than obsolete generic copy.
needle = '  test("sends the selected durable thread to the shared Ask rail", async ({ page }) => {'
start = s.index(needle)
end = s.index('  test("starts reviewable method reasoning', start)
block = s[start:end]
old = '    await expect(rail).toContainText("Ask · synthesis thread");\n'
if block.count(old) != 1:
    raise SystemExit(f'Ask Method design label: expected 1 local match, got {block.count(old)}')
block = block.replace(old, '    await expect(rail).toContainText("Ask · Method design");\n', 1)
s = s[:start] + block + s[end:]

needle = '  test("starts reviewable method reasoning from a grounded construction", async ({ page }) => {'
start = s.index(needle)
end = s.index('  test("refreshes the canvas in the same Ask turn', start)
block = s[start:end]
old = '    await expect(page.locator("aside.rd-v2-rail")).toContainText("Ask · synthesis thread");\n'
if block.count(old) != 1:
    raise SystemExit(f'Ask Proposal review label: expected 1 local match, got {block.count(old)}')
block = block.replace(old, '    await expect(page.locator("aside.rd-v2-rail")).toContainText("Ask · Proposal review");\n', 1)
s = s[:start] + block + s[end:]

# 3. Draft entry now exposes a phase-specific Ask surface instead of the old generic studio label.
replace_once(
'    await expect(page.locator("aside.rd-v2-rail")).toContainText("Synthesis studio");\n',
'    await expect(page.locator("aside.rd-v2-rail")).toContainText("Ask · Research objective");\n',
'new construction rail label',
)

# 4. Join overlap contract follows the current explicit set-membership labels.
replace_once(
'''    await expect(page.getByTestId("synthesis-join-overlap-visual")).toBeVisible();
    await expect(panel).toContainText("520 on the right match nothing here");
    await expect(panel).toContainText("a different population");
''',
'''    const overlap = page.getByTestId("synthesis-join-overlap-visual");
    await expect(overlap).toBeVisible();
    await expect(overlap).toContainText("585");
    await expect(overlap).toContainText("current only");
    await expect(overlap).toContainText("50");
    await expect(overlap).toContainText("usable overlap");
    await expect(overlap).toContainText("520");
    await expect(overlap).toContainText("added only");
    await expect(panel).toContainText("a different population");
''',
'join overlap wording',
)

# 5. A measured unit conflict is itself the authoritative consequential surface.
replace_once(
'''    await expect(page.getByTestId("synthesis-unit-conflict")).toContainText("Measured warning");
    await expect(page.getByRole("button", { name: "Ask which is which" })).toHaveCount(0);
    const warningBox = await page.getByTestId("synthesis-unit-conflict").boundingBox();
    const nextBox = await page.getByRole("region", { name: "What happens next" }).boundingBox();
    expect(nextBox?.y).toBeLessThan(warningBox?.y);
    expect(
      (nextBox?.y || Infinity) + (nextBox?.height || Infinity),
      "the one consequential action should be visible before the deep evidence record",
    ).toBeLessThanOrEqual(1000);
    await expect(page.getByRole("region", { name: "Recommended construction" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "What happens next" })).toContainText(
      "finished deterministic checks against held evidence",
    );
''',
'''    const unitConflict = page.getByTestId("synthesis-unit-conflict");
    await expect(unitConflict).toContainText("Measured warning");
    await expect(page.getByRole("button", { name: "Ask which is which" })).toHaveCount(0);
    await expect(openingRail).toContainText("Measurement decision needed");
    await expect(openingRail).toContainText("Resolve the incompatible measurement scales");
    const warningBox = await unitConflict.boundingBox();
    const methodBox = await page.getByTestId("synthesis-method-surface").boundingBox();
    expect(warningBox?.y).toBeLessThan(methodBox?.y);
    expect(
      (warningBox?.y || Infinity) + (warningBox?.height || Infinity),
      "the authoritative measurement decision should be visible before the deep evidence record",
    ).toBeLessThanOrEqual(1000);
    await expect(page.getByRole("region", { name: "Recommended construction" })).toHaveCount(0);
''',
'measured decision authority',
)

if s == orig:
    raise SystemExit('no changes produced')
p.write_text(s)
print('six residue browser contracts aligned')
