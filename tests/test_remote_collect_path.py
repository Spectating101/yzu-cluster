from pathlib import Path

from scripts.yzu_cluster.acquisitions import remote_collect_script


def test_remote_collect_script_resolves_drive_root(tmp_path: Path):
    script = tmp_path / "scripts/cluster_agent/remote_collect.py"
    script.parent.mkdir(parents=True)
    script.write_text("# collector\n", encoding="utf-8")
    assert remote_collect_script(tmp_path) == script


def test_remote_collect_script_resolves_monorepo_root(tmp_path: Path):
    script = tmp_path / "drive/scripts/cluster_agent/remote_collect.py"
    script.parent.mkdir(parents=True)
    script.write_text("# collector\n", encoding="utf-8")
    assert remote_collect_script(tmp_path) == script


def test_remote_collect_script_prefers_monorepo_when_both_exist(tmp_path: Path):
    mono = tmp_path / "drive/scripts/cluster_agent/remote_collect.py"
    drive = tmp_path / "scripts/cluster_agent/remote_collect.py"
    mono.parent.mkdir(parents=True)
    drive.parent.mkdir(parents=True)
    mono.write_text("mono\n", encoding="utf-8")
    drive.write_text("drive\n", encoding="utf-8")
    assert remote_collect_script(tmp_path) == mono

from scripts.yzu_cluster.acquisitions import repo_relpath


def test_repo_relpath_maps_runtime_bind(tmp_path: Path):
    runtime = tmp_path / "runtime" / "data_lake" / "procured" / "ds1"
    runtime.mkdir(parents=True)
    target = runtime / "file.txt"
    target.write_text("x", encoding="utf-8")
    checkout = tmp_path / "front-door"
    (checkout / "data_lake").mkdir(parents=True)
    (checkout / "data_lake" / "procured").symlink_to(tmp_path / "runtime" / "data_lake" / "procured")
    assert repo_relpath(target, checkout) == "data_lake/procured/ds1/file.txt"
