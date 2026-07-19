from pathlib import Path

path = Path("drive/scripts/yzu_cluster/worker_control.py")
text = path.read_text(encoding="utf-8")
old = '''    from fastapi import Depends, FastAPI, Header, HTTPException, Request

    if orchestrator is None:
'''
new = '''    from fastapi import Depends, FastAPI, Header, HTTPException, Request as FastAPIRequest

    # Annotations are postponed in this module. Expose the lazily imported
    # request type in module globals so FastAPI injects the ASGI Request object
    # instead of interpreting `request` as a required body field.
    globals()["Request"] = FastAPIRequest

    if orchestrator is None:
'''
if text.count(old) != 1:
    raise SystemExit(f"expected one FastAPI import target, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
