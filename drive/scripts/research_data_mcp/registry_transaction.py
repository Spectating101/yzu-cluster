"""Atomic, process-safe updates for the canonical JSON registry."""
from __future__ import annotations

import json
import os
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, TypeVar

try:  # POSIX controller path.
    import fcntl  # type: ignore
except ImportError:  # pragma: no cover - Windows fallback.
    fcntl = None

try:  # pragma: no cover - exercised only on Windows controllers.
    import msvcrt  # type: ignore
except ImportError:  # pragma: no cover
    msvcrt = None

T = TypeVar("T")
_LOCKS_GUARD = threading.Lock()
_LOCKS: dict[Path, threading.RLock] = {}


def _thread_lock(path: Path) -> threading.RLock:
    canonical = path.resolve()
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(canonical, threading.RLock())


@contextmanager
def _advisory_lock(path: Path):
    lock_path = path.with_name(f".{path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+b") as handle:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        elif msvcrt is not None:  # pragma: no cover - Windows controller fallback.
            handle.seek(0, os.SEEK_END)
            if handle.tell() == 0:
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            elif msvcrt is not None:  # pragma: no cover
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def _atomic_write(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, raw_tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    tmp_path = Path(raw_tmp)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(document, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
        if os.name != "nt" and hasattr(os, "O_DIRECTORY"):
            directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    finally:
        tmp_path.unlink(missing_ok=True)


def atomic_update_json(path: str | Path, mutate: Callable[[dict[str, Any]], T]) -> T:
    """Reload, mutate, and atomically replace a JSON document under one lock."""

    target = Path(path).resolve()
    with _thread_lock(target), _advisory_lock(target):
        document = json.loads(target.read_text(encoding="utf-8")) if target.is_file() else {}
        result = mutate(document)
        _atomic_write(target, document)
        return result
