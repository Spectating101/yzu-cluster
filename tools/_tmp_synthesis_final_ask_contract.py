from pathlib import Path

path = Path("e2e/v2-synthesis.spec.js")
text = path.read_text(encoding="utf-8")
replacements = [
    (
        '      "Correct the interpretation, add a constraint, or ask…",\n',
        '      "Ask about review measured evidence and turn it into one reviewable construction…",\n',
        "phase-aware method-design placeholder",
    ),
    (
        '    await expect(page.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");\n    await capture(page, "06-new-project-entry-desktop");\n',
        '    await expect(page.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "false");\n    await expect(page.getByTestId("rail-pane-detail")).toBeVisible();\n    await capture(page, "06-new-project-entry-desktop");\n',
        "quiet creation keeps Detail authoritative",
    ),
    (
        '    await expect(page.getByRole("region", { name: "Research brief" }).getByRole("paragraph")).toHaveText(objective);\n',
        '    await expect(page.getByRole("region", { name: "Research brief", exact: true }).first().getByRole("paragraph")).toHaveText(objective);\n',
        "scope duplicated research brief to workspace-first instance",
    ),
]
for old, new, label in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
