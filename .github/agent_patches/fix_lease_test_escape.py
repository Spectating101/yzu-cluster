from pathlib import Path

path = Path("tests/test_completion_lease_scope.py")
text = path.read_text(encoding="utf-8")
broken = '""".strip() + "\n",'
fixed = '""".strip() + "\\n",'
if text.count(broken) != 1:
    raise SystemExit(f"expected one broken generated newline, found {text.count(broken)}")
path.write_text(text.replace(broken, fixed, 1), encoding="utf-8")
