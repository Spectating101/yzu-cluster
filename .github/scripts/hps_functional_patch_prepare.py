from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
path = ROOT / "drive/src/v2/HomePage.jsx"
text = path.read_text()
old = '        kind: "approval",\n        tab: "browse",'
new = '        kind: point.kind || "attention",\n        tab: "browse",'

# The convergence script historically owns this replacement. HomePage now
# carries the corrected form permanently, so normalize only that anchor before
# replaying the guarded patch; the convergence script immediately restores the
# exact corrected bytes. This keeps the replay deterministic without weakening
# any acceptance check.
if old in text:
    print("HPS Home compatibility anchor already in baseline form")
elif new in text:
    path.write_text(text.replace(new, old, 1))
    print("HPS Home compatibility anchor normalized for guarded replay")
else:
    raise SystemExit("Home attention compatibility anchor not found")
