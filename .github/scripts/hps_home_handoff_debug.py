from pathlib import Path

p = Path(__file__).resolve().parents[2] / "e2e/hps-functional-convergence.spec.js"
text = p.read_text()
old = '''  await expect(pick).toContainText(/Proposal review/i);\n  await pick.getByRole("button", { name: "Continue" }).click();\n\n  await expect(page.getByTestId("synthesis-studio")).toBeVisible();'''
new = '''  await expect(pick).toContainText(/Proposal review/i);\n  const pageErrors = [];\n  page.on("pageerror", (error) => {\n    pageErrors.push(String(error?.stack || error?.message || error));\n    console.log("HPS_HOME_PAGEERROR", pageErrors[pageErrors.length - 1]);\n  });\n  await pick.getByRole("button", { name: "Continue" }).click();\n  await page.waitForTimeout(300);\n  console.log("HPS_HOME_POST_CLICK", JSON.stringify({\n    url: page.url(),\n    homeVisible: await page.getByTestId("home-continue").isVisible().catch(() => false),\n    synthesisVisible: await page.getByTestId("synthesis-studio").isVisible().catch(() => false),\n    pageErrors,\n  }));\n  await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe("synthesis");\n  expect(pageErrors).toEqual([]);\n\n  await expect(page.getByTestId("synthesis-studio")).toBeVisible();'''
if text.count(old) != 1:
    raise SystemExit(f"expected one Home handoff anchor, found {text.count(old)}")
p.write_text(text.replace(old, new, 1))
print("Home handoff diagnostic instrumentation applied")
