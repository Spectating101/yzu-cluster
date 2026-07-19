from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one patch target in {path}, found {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "drive/scripts/yzu_cluster/remote_worker.py",
    "from pathlib import Path\nfrom typing import Any\nfrom urllib.error import HTTPError, URLError\nfrom urllib.parse import quote\n",
    "from http.client import HTTPConnection, HTTPSConnection\nfrom pathlib import Path\nfrom typing import Any\nfrom urllib.error import HTTPError, URLError\nfrom urllib.parse import quote, urlsplit\n",
)

replace_once(
    "drive/scripts/yzu_cluster/remote_worker.py",
    '''    def upload(
        self,
        job_id: str,
        *,
        worker_id: str,
        attempt: int,
        path: Path,
    ) -> dict[str, Any]:
        content = path.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        return self._request(
            "PUT",
            f"/v1/jobs/{quote(job_id, safe='')}/artifacts/{quote(path.name, safe='')}",
            content=content,
            headers={
                "Content-Type": "application/octet-stream",
                "X-YZU-Worker-Id": worker_id,
                "X-YZU-Attempt": str(attempt),
                "X-Content-Sha256": digest,
            },
            timeout=max(self.timeout, 1800),
        )
''',
    '''    def upload(
        self,
        job_id: str,
        *,
        worker_id: str,
        attempt: int,
        path: Path,
    ) -> dict[str, Any]:
        size = path.stat().st_size
        digest_builder = hashlib.sha256()
        with path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                digest_builder.update(chunk)
        digest = digest_builder.hexdigest()

        parsed = urlsplit(self.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("worker control URL must be http or https")
        connection_type = HTTPSConnection if parsed.scheme == "https" else HTTPConnection
        connection = connection_type(
            parsed.hostname,
            parsed.port,
            timeout=max(self.timeout, 1800),
        )
        endpoint = (
            f"{parsed.path.rstrip('/')}/v1/jobs/{quote(job_id, safe='')}/artifacts/"
            f"{quote(path.name, safe='')}"
        )
        try:
            connection.putrequest("PUT", endpoint)
            connection.putheader("Authorization", f"Bearer {self.token}")
            connection.putheader("Accept", "application/json")
            connection.putheader("Content-Type", "application/octet-stream")
            connection.putheader("Content-Length", str(size))
            connection.putheader("X-YZU-Worker-Id", worker_id)
            connection.putheader("X-YZU-Attempt", str(attempt))
            connection.putheader("X-Content-Sha256", digest)
            connection.endheaders()
            with path.open("rb") as handle:
                while chunk := handle.read(1024 * 1024):
                    connection.send(chunk)
            response = connection.getresponse()
            raw = response.read()
            if response.status >= 400:
                detail = raw.decode("utf-8", errors="replace")
                raise RuntimeError(f"control plane HTTP {response.status}: {detail}")
            return json.loads(raw.decode("utf-8")) if raw else {}
        finally:
            connection.close()
''',
)
