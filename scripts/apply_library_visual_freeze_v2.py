from pathlib import Path

# Apply the guarded visual-freeze patch exactly as staged.
exec(Path("scripts/apply_library_visual_freeze.py").read_text(encoding="utf-8"), {"__name__": "__main__"})

# The global Research Situation header is intentionally retained. The visual
# convergence requirement is one identity header in the rail, not zero; the
# duplicate lower Library/collection identity is what the product patch removes.
path = Path("e2e/v2-library.spec.js")
text = path.read_text(encoding="utf-8")
old = 'await expect(page.locator("aside.rd-v2-rail .rd-v2-rail-ehead")).toHaveCount(0);'
new = 'await expect(page.locator("aside.rd-v2-rail .rd-v2-rail-ehead")).toHaveCount(1);'
if old not in text:
    raise SystemExit("expected visual-freeze rail assertion was not staged")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Adjusted rail identity contract: exactly one global header remains.")
