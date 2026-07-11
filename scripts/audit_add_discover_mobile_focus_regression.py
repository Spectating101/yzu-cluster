from pathlib import Path

path = Path("e2e/v2-discover.spec.js")
text = path.read_text()

anchor = '''  test("Discover candidate Ask actions carry candidate context", async ({ page }) => {
'''
assert anchor in text, "Ask-context test anchor not found"

new_test = '''  test("mobile Discover Focus owns the viewport until Ask is opened explicitly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1200 });
    await mockV2Api(page, { discoverBody: MOCK_DISCOVER_HIT });
    await page.goto("/?tab=browse", { waitUntil: "domcontentloaded" });
    await waitForShell(page);
    await page.locator(".rd-v2-search-pill input").fill("mops");
    await page.locator('.rd-v2-catalog button.row.rd-v2-discover-candidate', { hasText: "MOPS" }).click();

    const shell = page.locator(".rd-v2-shell");
    const rail = page.locator("aside.rd-v2-rail");
    const actions = page.getByTestId("discover-eval-actions");

    await expect(page.getByTestId("discover-focus-workspace")).toBeVisible();
    await expect(shell).toHaveClass(/no-rail/);
    await expect(rail).toHaveClass(/rd-v2-rail-collapsed/);
    await expect(rail).not.toBeVisible();
    await expect(actions.locator(".rd-v2-btn.primary")).toHaveCount(1);

    const focusGeometry = await page.evaluate(() => {
      const main = document.querySelector(".yzu-main");
      const actionRegion = document.querySelector('[data-testid="discover-eval-actions"]');
      const primary = actionRegion?.querySelector(".rd-v2-btn.primary");
      const secondary = actionRegion?.querySelector(".rd-v2-eval-mobile-secondary-row");
      const actionRect = actionRegion?.getBoundingClientRect();
      const primaryRect = primary?.getBoundingClientRect();
      const secondaryRect = secondary?.getBoundingClientRect();
      return {
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        documentScrollHeight: document.documentElement.scrollHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        mainPaddingBottom: main ? getComputedStyle(main).paddingBottom : null,
        actionsBottom: actionRect?.bottom ?? null,
        primaryLeft: primaryRect?.left ?? null,
        primaryRight: primaryRect?.right ?? null,
        secondaryLeft: secondaryRect?.left ?? null,
        secondaryRight: secondaryRect?.right ?? null,
      };
    });

    expect(focusGeometry.documentScrollHeight).toBeLessThanOrEqual(focusGeometry.viewportHeight);
    expect(focusGeometry.documentScrollWidth).toBeLessThanOrEqual(focusGeometry.viewportWidth);
    expect(focusGeometry.mainPaddingBottom).toBe("0px");
    expect(Math.round(focusGeometry.actionsBottom)).toBe(focusGeometry.viewportHeight);
    expect(Math.round(focusGeometry.primaryLeft)).toBe(12);
    expect(Math.round(focusGeometry.primaryRight)).toBe(378);
    expect(Math.round(focusGeometry.secondaryLeft)).toBe(12);
    expect(Math.round(focusGeometry.secondaryRight)).toBe(378);

    await page.getByTestId("discover-focus-workspace").getByRole("button", { name: "Ask", exact: true }).click();
    await expect(shell).not.toHaveClass(/no-rail/);
    await expect(rail).not.toHaveClass(/rd-v2-rail-collapsed/);
    await expect(rail).toBeVisible();
    await expect(rail.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
  });

'''

text = text.replace(anchor, new_test + anchor, 1)
path.write_text(text)
