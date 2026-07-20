from pathlib import Path

import pytest

from scripts.research_query_engine import server


def test_normalize_api_path_keeps_direct_routes_and_strips_api_prefix():
    assert server.normalize_api_path("/health") == "/health"
    assert server.normalize_api_path("/api/health") == "/health"
    assert server.normalize_api_path("/api/library/live-identity") == "/library/live-identity"
    assert server.normalize_api_path("/api") == "/"


def test_is_api_path_does_not_capture_spa_routes():
    assert server.is_api_path("/health")
    assert server.is_api_path("/api/library/chat/stream")
    assert server.is_api_path("/datasets/example")
    assert not server.is_api_path("/")
    assert not server.is_api_path("/library-ui")
    assert not server.is_api_path("/discover/history")


def test_resolve_static_dir_uses_repo_root_for_relative_paths(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "REPO_ROOT", tmp_path)
    assert server.resolve_static_dir("public/dist") == (tmp_path / "public/dist").resolve()


def test_resolve_static_dir_prefers_explicit_value_over_environment(monkeypatch, tmp_path):
    env_dir = tmp_path / "env-dist"
    explicit_dir = tmp_path / "explicit-dist"
    monkeypatch.setenv("YZU_DESK_STATIC_DIR", str(env_dir))
    assert server.resolve_static_dir(explicit_dir) == explicit_dir.resolve()


def test_require_ui_build_fails_fast_without_index(tmp_path):
    with pytest.raises(FileNotFoundError, match="UI build missing"):
        server.require_ui_build(tmp_path)


def test_require_ui_build_accepts_public_dist(tmp_path):
    index = tmp_path / "index.html"
    index.write_text("<main>Research Drive</main>", encoding="utf-8")
    assert server.require_ui_build(tmp_path) == index


def test_parser_reads_optiplex_environment(monkeypatch, tmp_path):
    static_dir = tmp_path / "dist"
    registry = tmp_path / "registry.json"
    monkeypatch.setenv("YZU_DESK_HOST", "100.64.0.10")
    monkeypatch.setenv("YZU_DESK_PORT", "9876")
    monkeypatch.setenv("YZU_DESK_STATIC_DIR", str(static_dir))
    monkeypatch.setenv("SHARPE_REGISTRY_PATH", str(registry))
    monkeypatch.setenv("YZU_DESK_SERVE_UI", "true")

    args = server.build_parser().parse_args([])

    assert args.host == "100.64.0.10"
    assert args.port == 9876
    assert Path(args.static_dir) == static_dir
    assert Path(args.registry) == registry
    assert args.serve_ui is True


def test_invalid_environment_port_is_rejected(monkeypatch):
    monkeypatch.setenv("YZU_DESK_PORT", "not-a-port")
    with pytest.raises(ValueError, match="must be an integer"):
        server.build_parser()
