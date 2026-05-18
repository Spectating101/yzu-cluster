#!/usr/bin/env python3
"""
Update Cite-Agent topics using local keys from an env file.

This avoids relying on the running Cite-Agent API server having ARCHIVE_API_KEY
set in its process environment.

It does NOT print or persist secret values.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple


def _load_dotenv(path: Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if not path.exists():
        return out
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k:
            out[k] = v
    return out


def _resolve_archive_creds(env: Dict[str, str]) -> Tuple[str, str]:
    api_key = env.get("ARCHIVE_API_KEY") or env.get("NOCTURNAL_ARCHIVE_API_KEY") or env.get("NOCTURNAL_KEY") or ""
    api_url = env.get("ARCHIVE_API_URL") or env.get("NOCTURNAL_ARCHIVE_API_URL") or env.get("NOCTURNAL_API_URL") or ""
    return str(api_key), str(api_url)


async def _run_updates(topics: List[str], *, api_key: str, api_url: str) -> int:
    cite_agent_root = (Path(__file__).resolve().parents[2] / "Cite-Agent").resolve()
    if not cite_agent_root.exists():
        # fallback to sibling of repo root (Molina-Optiplex/../Cite-Agent)
        cite_agent_root = (Path(__file__).resolve().parents[3] / "Cite-Agent").resolve()
    if not cite_agent_root.exists():
        print(f"Missing Cite-Agent repo at {cite_agent_root}")
        return 2
    if str(cite_agent_root) not in sys.path:
        sys.path.insert(0, str(cite_agent_root))

    from cite_agent.topic_monitor import TopicMonitor  # type: ignore

    # Cite-Agent modules may auto-load `.env.local` on import (via python-dotenv),
    # re-introducing Cerebras keys. Force fallback mode by unsetting them again.
    for k in list(os.environ.keys()):
        if k == "CEREBRAS_API_KEY" or k.startswith("CEREBRAS_API_KEY_"):
            os.environ.pop(k, None)

    tm = TopicMonitor()
    ok = 0
    for name in topics:
        res = await tm.update_topic_process(name, api_key, api_url)
        if bool(res.get("success")):
            ok += 1
            print(f"✅ updated {name} (papers={res.get('papers_found')}, new_findings={res.get('new_findings_count')})")
        else:
            print(f"❌ failed {name}: {res.get('message')}")
    return 0 if ok == len(topics) else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="Update Cite-Agent topics locally.")
    ap.add_argument("--env-file", type=Path, required=True)
    ap.add_argument("--topics", nargs="+", required=True)
    args = ap.parse_args()

    env = _load_dotenv(args.env_file)
    for k, v in env.items():
        os.environ.setdefault(k, v)

    # The Cite-Agent search/synthesis modules will try to initialize an OpenAI-compatible
    # client if CEREBRAS_API_KEY is set. In this environment the installed openai/httpx
    # combo may be incompatible, so force fallback mode by unsetting Cerebras keys here.
    for k in list(os.environ.keys()):
        if k == "CEREBRAS_API_KEY" or k.startswith("CEREBRAS_API_KEY_"):
            os.environ.pop(k, None)

    api_key, api_url = _resolve_archive_creds(env | dict(os.environ))
    if not api_key or not api_url:
        print("Missing archive API credentials; expected NOCTURNAL_KEY/NOCTURNAL_API_URL or ARCHIVE_API_KEY/ARCHIVE_API_URL.")
        return 2

    return int(asyncio.run(_run_updates(list(args.topics), api_key=api_key, api_url=api_url)))


if __name__ == "__main__":
    raise SystemExit(main())
