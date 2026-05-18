from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class CiteAgentTopic:
    name: str
    query: str
    description: str
    last_updated: Optional[str]
    state: Dict[str, Any]


class CiteAgentClient:
    """
    Minimal client for the Cite-Agent API server (local/LAN).

    This client is intentionally stdlib-only (no requests dependency).
    """

    def __init__(self, base_url: str, *, timeout_s: float = 10.0, api_key: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self.api_key = api_key

    def _request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{self.base_url}{path}"
        data = None
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8") if hasattr(e, "read") else ""
            raise RuntimeError(f"Cite-Agent HTTP {e.code} {method} {path}: {raw}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"Cite-Agent unreachable at {url}: {e}") from e

    def list_topics(self) -> List[CiteAgentTopic]:
        data = self._request("GET", "/api/v1/topics")
        out: List[CiteAgentTopic] = []
        for t in (data or []):
            out.append(
                CiteAgentTopic(
                    name=str(t.get("name", "")),
                    query=str(t.get("query", "")),
                    description=str(t.get("description", "")),
                    last_updated=t.get("last_updated"),
                    state=dict(t.get("state") or {}),
                )
            )
        return out

    def get_topic(self, name: str) -> CiteAgentTopic:
        data = self._request("GET", f"/api/v1/topics/{urllib.parse.quote(name)}")
        return CiteAgentTopic(
            name=str(data.get("name", "")),
            query=str(data.get("query", "")),
            description=str(data.get("description", "")),
            last_updated=data.get("last_updated"),
            state=dict(data.get("state") or {}),
        )

    def create_topic(self, *, name: str, query: str, description: str = "") -> CiteAgentTopic:
        data = self._request("POST", "/api/v1/topics", {"name": name, "query": query, "description": description})
        return CiteAgentTopic(
            name=str(data.get("name", "")),
            query=str(data.get("query", "")),
            description=str(data.get("description", "")),
            last_updated=data.get("last_updated"),
            state=dict(data.get("state") or {}),
        )

    def update_topic(self, name: str) -> Dict[str, Any]:
        """
        Trigger a topic update (search -> synthesize -> delta) on the Cite-Agent server.

        Returns the UpdateTopicResponse payload (success/message/report_path/etc).
        """
        return dict(self._request("POST", f"/api/v1/topics/{urllib.parse.quote(name)}/update") or {})
