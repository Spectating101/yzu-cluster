from pathlib import Path
import re

path = Path("tests/test_completion_lease_scope.py")
text = path.read_text(encoding="utf-8")

broken = '""".strip() + "\n",'
fixed = '""".strip() + "\\n",'
if text.count(broken) == 1:
    text = text.replace(broken, fixed, 1)
elif text.count(fixed) != 1:
    raise SystemExit("generated script terminator not found")

marker = "timestamp," + "value"
start = text.find(marker)
stop = text.find("')", start)
if start < 0 or stop < 0:
    raise SystemExit("embedded fixture segment not found")
fragment = text[start:stop]
fragment = fragment.replace(chr(10), r"\n")
fragment = re.sub(r"(?<!\\)\\n", r"\\\\n", fragment)
text = text[:start] + fragment + text[stop:]

path.write_text(text, encoding="utf-8")
