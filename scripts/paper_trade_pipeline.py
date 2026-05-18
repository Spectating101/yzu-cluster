#!/usr/bin/env python3
"""
Paper trading pipeline (hedge-fund style loop, simplified):
  1) Generate a signal (dynamic-regime protocol -> signal.json)
  2) Execute rebalance orders against a *paper* broker (FileBroker)
  3) Reconcile + write a daily report + append to a portfolio ledger

This does NOT place real orders. It only mutates a local JSON state file.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

import sys


_WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from trading.execution.file_broker import FileBroker  # noqa: E402


def _resolve_repo_path(path_like: str | Path) -> Path:
    path = Path(path_like)
    if path.is_absolute():
        return path.resolve()
    parts = list(path.parts)
    trimmed = path
    if parts and parts[0] == _REPO_ROOT.name:
        trimmed = Path(*parts[1:]) if len(parts) > 1 else Path(".")
    repo_default = _REPO_ROOT / trimmed
    workspace_default = _WORKSPACE_ROOT / trimmed
    candidates = [path, repo_default, workspace_default]
    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()
    return repo_default.resolve()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n")


def _write_md(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _load_panel_prices(panel_csv: Path) -> pd.DataFrame:
    df = pd.read_csv(panel_csv, parse_dates=["Date"])
    need = {"Instrument", "Date", "Price_Close"}
    if not need.issubset(df.columns):
        raise SystemExit(f"Panel must have columns: {sorted(need)}")
    df = df.dropna(subset=["Instrument", "Date", "Price_Close"]).copy()
    df["Price_Close"] = pd.to_numeric(df["Price_Close"], errors="coerce")
    df = df.dropna(subset=["Price_Close"])
    px = df.pivot_table(index="Date", columns="Instrument", values="Price_Close", aggfunc="last").sort_index().ffill()
    return px


def _load_snapshot(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        obj = json.loads(path.read_text())
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


def _latest_snapshot(snapshots_dir: Path) -> Optional[Path]:
    if not snapshots_dir.exists():
        return None
    cands = sorted([p for p in snapshots_dir.glob("*.json") if p.is_file()])
    return cands[-1] if cands else None


def _compute_pnl_attribution(
    *,
    prev_snapshot: Dict[str, Any],
    prev_mark_date: pd.Timestamp,
    mark_date: pd.Timestamp,
    px: pd.DataFrame,
    cash_symbol: str,
) -> Dict[str, Any]:
    prev_pos = {str(k): float(v) for k, v in (prev_snapshot.get("positions") or {}).items()}
    if prev_mark_date not in px.index or mark_date not in px.index:
        return {"status": "no_price_dates"}
    p0 = px.loc[prev_mark_date].to_dict()
    p1 = px.loc[mark_date].to_dict()

    rows: List[Dict[str, Any]] = []
    total_pnl = 0.0
    for sym, sh in prev_pos.items():
        # cash_symbol is treated as an ETF if held; CASH is handled separately.
        _ = cash_symbol
        if sym not in p0 or sym not in p1:
            continue
        pnl = float(sh) * float(p1[sym] - p0[sym])
        total_pnl += pnl
        rows.append({"symbol": sym, "qty": float(sh), "price0": float(p0[sym]), "price1": float(p1[sym]), "pnl": pnl})
    rows.sort(key=lambda r: abs(float(r["pnl"])), reverse=True)
    return {"status": "ok", "total_pnl": float(total_pnl), "by_symbol": rows[:50]}


def _append_ledger_row(ledger_csv: Path, row: Dict[str, Any]) -> None:
    ledger_csv.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame([row])
    if ledger_csv.exists():
        existing = pd.read_csv(ledger_csv)
        combined = pd.concat([existing, df], ignore_index=True)
    else:
        combined = df
    if "date" in combined.columns:
        combined["date"] = pd.to_datetime(combined["date"], errors="coerce")
        combined = combined.sort_values("date").drop_duplicates(["date"], keep="last")
        combined["date"] = combined["date"].dt.date.astype(str)
    combined.to_csv(ledger_csv, index=False)


def _ledger_stats(ledger_csv: Path) -> Dict[str, float]:
    if not ledger_csv.exists():
        return {"peak_equity": 0.0, "drawdown": 0.0}
    df = pd.read_csv(ledger_csv)
    if df.empty or "equity" not in df.columns:
        return {"peak_equity": 0.0, "drawdown": 0.0}
    eq = pd.to_numeric(df["equity"], errors="coerce").fillna(0.0)
    peak = float(eq.max()) if len(eq) else 0.0
    cur = float(eq.iloc[-1]) if len(eq) else 0.0
    dd = float(cur / peak - 1.0) if peak > 0 else 0.0
    return {"peak_equity": peak, "drawdown": dd}


def _run(cmd: List[str], *, cwd: Path) -> None:
    p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{p.stderr[-2000:]}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Paper trade pipeline for dynamic-regime protocol.")
    ap.add_argument(
        "--protocol-json",
        type=Path,
        default=_REPO_ROOT / "config" / "dynamic_regime_protocol_signal_ready.json",
    )
    ap.add_argument("--out-root", type=Path, default=_REPO_ROOT / "backtests" / "outputs" / "paper_live")
    ap.add_argument("--paper-state", type=Path, default=None, help="Defaults to <out-root>/state.json")
    ap.add_argument("--paper-live-state", type=Path, default=None, help="Defaults to <out-root>/live_state.json")
    ap.add_argument("--execute", action="store_true", help="Actually update paper-state (otherwise dry-run).")
    ap.add_argument("--initial-cash", type=float, default=10_000.0)
    ap.add_argument("--cash-symbol", type=str, default="BIL")
    ap.add_argument("--max-turnover", type=float, default=0.80)
    ap.add_argument("--min-order-notional", type=float, default=25.0)
    ap.add_argument("--max-order-notional", type=float, default=100_000.0)
    ap.add_argument("--max-orders", type=int, default=50)
    ap.add_argument("--order-type", choices=["limit", "market"], default="limit")
    ap.add_argument("--limit-buffer-bps", type=float, default=15.0)
    ap.add_argument("--stale-signal-days", type=int, default=10)
    ap.add_argument("--allow-repeat-as-of", action="store_true", help="Allow executing the same signal as_of twice (paper only).")
    ap.add_argument("--risk-max-drawdown", type=float, default=0.25, help="If drawdown <= -this, block execution.")
    ap.add_argument("--risk-max-daily-loss", type=float, default=0.08, help="If daily_return <= -this, block execution.")

    ap.add_argument("--portable-ls", action="store_true", help="Apply portable long/short momentum sleeve overlay (paper/research).")
    ap.add_argument("--portable-universe", type=Path, default=None, help="Universe file for sleeve candidates (one ticker per line).")
    ap.add_argument("--portable-sleeve-gross", type=float, default=0.20)
    ap.add_argument("--portable-long-k", type=int, default=10)
    ap.add_argument("--portable-short-k", type=int, default=10)
    ap.add_argument("--portable-mom-short", type=int, default=21)
    ap.add_argument("--portable-mom-long", type=int, default=126)
    ap.add_argument("--portable-only-when-regime", type=str, default="risk_on")
    ap.add_argument("--portable-max-gross-exposure", type=float, default=1.60)
    ap.add_argument("--portable-max-short-exposure", type=float, default=0.35)
    ap.add_argument("--market-context", type=Path, default=None, help="Existing MARKET_CONTEXT.json to overlay on protocol.")
    ap.add_argument("--market-context-auto", action="store_true", help="Auto-build market context before generating signal.")
    ap.add_argument(
        "--market-context-out",
        type=Path,
        default=Path("MARKET_CONTEXT.json"),
        help="Where auto-generated market context JSON is written.",
    )
    ap.add_argument(
        "--market-context-md",
        type=Path,
        default=_REPO_ROOT / "backtests" / "outputs" / "market_context" / "latest.md",
        help="Where auto-generated market context markdown report is written.",
    )
    ap.add_argument(
        "--market-context-strict",
        action="store_true",
        help="Fail run if context build/apply fails.",
    )
    ap.add_argument(
        "--market-context-mode",
        choices=["soft", "balanced", "strict"],
        default="soft",
        help="How aggressively context modifies gross exposure in overlay.",
    )
    args = ap.parse_args()

    args.protocol_json = _resolve_repo_path(args.protocol_json)
    out_root = _resolve_repo_path(args.out_root)
    paper_state = _resolve_repo_path(args.paper_state) if args.paper_state is not None else (out_root / "state.json")
    paper_live_state = _resolve_repo_path(args.paper_live_state) if args.paper_live_state is not None else (out_root / "live_state.json")
    if args.portable_universe is not None:
        args.portable_universe = _resolve_repo_path(args.portable_universe)
    if args.market_context is not None:
        args.market_context = _resolve_repo_path(args.market_context)
    args.market_context_out = _resolve_repo_path(args.market_context_out)
    args.market_context_md = _resolve_repo_path(args.market_context_md)

    protocol = _read_json(args.protocol_json)
    panel_rel = Path(str(protocol.get("panel") or ""))
    if not panel_rel:
        raise SystemExit("protocol.json missing panel")
    panel_csv = _resolve_repo_path(panel_rel)
    if not panel_csv.exists():
        raise SystemExit(f"panel not found: {panel_csv}")

    now = _utc_now()
    run_date = now.date().isoformat()
    run_dir = out_root / run_date
    strat_dir = run_dir / "strategy"
    exec_dir = run_dir / "execution"
    report_dir = run_dir / "report"
    ledger_csv = out_root / "ledger.csv"
    snapshots_dir = out_root / "snapshots"
    alerts_dir = out_root / "alerts"

    run_dir.mkdir(parents=True, exist_ok=True)

    # 0) Bootstrap paper state if missing.
    if not paper_state.exists():
        paper_state.parent.mkdir(parents=True, exist_ok=True)
        _write_json(paper_state, {"cash": float(args.initial_cash), "positions": {}})

    # Pre-run risk gate based on existing ledger (drawdown / last daily return).
    block_reason: Optional[str] = None
    if ledger_csv.exists():
        prev = pd.read_csv(ledger_csv)
        if not prev.empty:
            if "drawdown" in prev.columns:
                last_dd = float(pd.to_numeric(prev["drawdown"], errors="coerce").dropna().iloc[-1])
                if last_dd <= -float(args.risk_max_drawdown):
                    block_reason = f"risk_max_drawdown breached: {last_dd:.4f} <= {-float(args.risk_max_drawdown):.4f}"
            if block_reason is None and "daily_return" in prev.columns:
                last_dr = float(pd.to_numeric(prev["daily_return"], errors="coerce").dropna().iloc[-1])
                if last_dr <= -float(args.risk_max_daily_loss):
                    block_reason = f"risk_max_daily_loss breached: {last_dr:.4f} <= {-float(args.risk_max_daily_loss):.4f}"

    # 1) Build/apply context overlay (optional), then generate a fresh signal.
    protocol_in_use = Path(args.protocol_json)
    context_json_used: Optional[Path] = None
    context_obj: Optional[Dict[str, Any]] = None

    if bool(args.market_context_auto):
        context_json_used = Path(args.market_context_out)
        try:
            _run(
                [
                    sys.executable,
                    str(_REPO_ROOT / "scripts" / "build_market_context_daily.py"),
                    "--out-json",
                    str(context_json_used),
                    "--out-md",
                    str(args.market_context_md),
                ],
                cwd=_REPO_ROOT,
            )
        except Exception as e:
            msg = f"market context auto-build failed: {type(e).__name__}: {e}"
            if bool(args.market_context_strict):
                raise RuntimeError(msg) from e
            print(f"[warn] {msg}")
            context_json_used = None

    if context_json_used is None and args.market_context is not None:
            context_json_used = Path(args.market_context)

    if context_json_used is not None and context_json_used.exists():
        try:
            context_obj = _read_json(context_json_used)
            protocol_overlay = strat_dir / "protocol.with_context.json"
            _run(
                [
                    sys.executable,
                    str(_REPO_ROOT / "scripts" / "apply_intelligence_overlay.py"),
                    "--protocol-in",
                    str(args.protocol_json),
                    "--market-context",
                    str(context_json_used),
                    "--protocol-out",
                    str(protocol_overlay),
                    "--mode",
                    str(args.market_context_mode),
                ],
                cwd=_REPO_ROOT,
            )
            protocol_in_use = protocol_overlay
        except Exception as e:
            msg = f"market context overlay failed: {type(e).__name__}: {e}"
            if bool(args.market_context_strict):
                raise RuntimeError(msg) from e
            print(f"[warn] {msg}")

    # 2) Generate a fresh signal artifact from the selected protocol.
    _run(
        [
            sys.executable,
            str(_REPO_ROOT / "scripts" / "run_dynamic_regime_protocol.py"),
            "--protocol-json",
            str(protocol_in_use),
            "--out-dir",
            str(strat_dir),
        ],
        cwd=_REPO_ROOT,
    )
    signal_path = strat_dir / "signal.json"
    if not signal_path.exists():
        raise SystemExit(f"signal not produced: {signal_path}")

    exec_signal_path = signal_path
    if bool(args.portable_ls):
        if args.portable_universe is None:
            raise SystemExit("--portable-ls requires --portable-universe")
        overlay_signal = strat_dir / "signal_portable_ls.json"
        _run(
            [
                sys.executable,
                str(_REPO_ROOT / "scripts" / "apply_portable_momentum_ls_overlay.py"),
                "--signal-json",
                str(signal_path),
                "--panel",
                str(panel_csv),
                "--universe",
                str(args.portable_universe),
                "--out-signal",
                str(overlay_signal),
                "--sleeve-gross",
                str(float(args.portable_sleeve_gross)),
                "--long-k",
                str(int(args.portable_long_k)),
                "--short-k",
                str(int(args.portable_short_k)),
                "--mom-short",
                str(int(args.portable_mom_short)),
                "--mom-long",
                str(int(args.portable_mom_long)),
                "--only-when-regime",
                str(args.portable_only_when_regime),
            ],
            cwd=_REPO_ROOT,
        )
        if overlay_signal.exists():
            exec_signal_path = overlay_signal

    # Determine mark date (latest date in the panel). This is the paper "pricing date".
    px = _load_panel_prices(panel_csv)
    if px.empty:
        raise SystemExit("Empty price panel.")
    mark_date = pd.Timestamp(px.index.max()).normalize()

    # Load previous snapshot (most recent) for attribution.
    prev_snap_path = _latest_snapshot(snapshots_dir)
    prev_snapshot = _load_snapshot(prev_snap_path) if prev_snap_path else None
    prev_mark_date: Optional[pd.Timestamp] = None
    if prev_snapshot and prev_snapshot.get("mark_date"):
        try:
            prev_mark_date = pd.to_datetime(prev_snapshot["mark_date"]).normalize()
        except Exception:
            prev_mark_date = None

    # 3) Execute against FileBroker (paper) via the safe live executor.
    live_exec_cmd = [
        sys.executable,
        str(_REPO_ROOT / "scripts" / "live_trade_from_signal.py"),
        "--signal-json",
        str(exec_signal_path),
        "--out-dir",
        str(exec_dir),
        "--live-state",
        str(paper_live_state),
        "--broker",
        "file",
        "--file-state",
        str(paper_state),
        "--file-panel",
        str(panel_csv),
        "--cash-symbol",
        str(args.cash_symbol),
        "--max-turnover",
        str(float(args.max_turnover)),
        "--min-order-notional",
        str(float(args.min_order_notional)),
        "--max-order-notional",
        str(float(args.max_order_notional)),
        "--max-orders",
        str(int(args.max_orders)),
        "--order-type",
        str(args.order_type),
        "--limit-buffer-bps",
        str(float(args.limit_buffer_bps)),
        "--reference-date",
        str(mark_date.date()),
        "--stale-signal-days",
        str(int(args.stale_signal_days)),
    ]
    if bool(args.portable_ls):
        live_exec_cmd += [
            "--allow-shorts",
            "--max-gross-exposure",
            str(float(args.portable_max_gross_exposure)),
            "--max-short-exposure",
            str(float(args.portable_max_short_exposure)),
        ]
    do_execute = bool(args.execute) and (block_reason is None)
    if do_execute:
        live_exec_cmd += ["--execute", "--ack-live-risk"]
        if bool(args.allow_repeat_as_of):
            live_exec_cmd += ["--allow-repeat-as-of"]
    _run(live_exec_cmd, cwd=_REPO_ROOT)

    # 4) Reconcile + report.
    broker = FileBroker(state_json=paper_state, panel_csv=panel_csv, cash_symbol=str(args.cash_symbol))
    acct = broker.get_account()
    positions = broker.list_positions()
    pos_rows = sorted(
        [{"symbol": p.symbol, "qty": float(p.qty), "market_value": float(p.market_value)} for p in positions],
        key=lambda r: abs(float(r["market_value"])),
        reverse=True,
    )

    equity = float(acct.equity)
    cash = float(acct.cash)
    gross = float(sum(abs(float(p["market_value"])) for p in pos_rows)) / max(1e-9, equity)
    n_pos = int(len(pos_rows))

    sig = _read_json(exec_signal_path)
    sig_as_of = str(sig.get("as_of") or "")
    sig_regime = str(sig.get("regime") or "")
    portable = sig.get("portable_overlay") if isinstance(sig.get("portable_overlay"), dict) else None
    stats = _ledger_stats(ledger_csv)

    # Compute daily return from ledger (if prior day exists).
    daily_ret = 0.0
    if ledger_csv.exists():
        prev = pd.read_csv(ledger_csv)
        if not prev.empty and "equity" in prev.columns:
            prev_eq = float(pd.to_numeric(prev["equity"], errors="coerce").dropna().iloc[-1])
            if prev_eq > 0:
                daily_ret = float(equity / prev_eq - 1.0)

    ledger_row = {
        "date": run_date,
        "signal_as_of": sig_as_of,
        "mark_date": str(mark_date.date()),
        "regime": sig_regime,
        "equity": equity,
        "cash": cash,
        "gross_exposure": gross,
        "n_positions": n_pos,
        "daily_return": daily_ret,
        "drawdown": float(stats.get("drawdown", 0.0)),
        "execute": bool(do_execute),
        "blocked_reason": block_reason or "",
    }
    _append_ledger_row(ledger_csv, ledger_row)
    stats2 = _ledger_stats(ledger_csv)

    # Snapshot current post-trade positions for future attribution.
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    cur_state = json.loads(paper_state.read_text())
    snap = {
        "date": run_date,
        "mark_date": str(mark_date.date()),
        "cash": float(cur_state.get("cash", 0.0)),
        "positions": {str(k): float(v) for k, v in (cur_state.get("positions", {}) or {}).items()},
    }
    _write_json(snapshots_dir / f"{run_date}.json", snap)

    attribution = {"status": "skipped", "reason": "no_prior_snapshot_or_same_mark_date"}
    if prev_snapshot is not None and prev_mark_date is not None and prev_mark_date != mark_date:
        attribution = _compute_pnl_attribution(
            prev_snapshot=prev_snapshot,
            prev_mark_date=prev_mark_date,
            mark_date=mark_date,
            px=px,
            cash_symbol=str(args.cash_symbol),
        )

    report = {
        "generated_utc": now.isoformat(),
        "run_date": run_date,
        "protocol_json": str(args.protocol_json),
        "protocol_in_use": str(protocol_in_use),
        "market_context": {
            "path": str(context_json_used) if context_json_used is not None else "",
            "stance": (context_obj or {}).get("recommended_stance", ""),
            "risk_score": (context_obj or {}).get("risk_score", None),
            "risk_level": (context_obj or {}).get("risk_level", ""),
            "gross_multiplier": ((context_obj or {}).get("overlay") or {}).get("meta_max_gross_multiplier", None),
        },
        "panel": str(panel_csv),
        "signal": {"path": str(exec_signal_path), "as_of": sig_as_of, "regime": sig_regime, "portable_overlay": portable or {}},
        "execution": {"execute": bool(do_execute), "blocked_reason": block_reason or "", "orders_proposed": str(exec_dir / "orders_proposed.json")},
        "account": {"equity": equity, "cash": cash, "gross_exposure": gross, "n_positions": n_pos},
        "ledger": {"path": str(ledger_csv), "daily_return": daily_ret, "peak_equity": stats2["peak_equity"], "drawdown": stats2["drawdown"]},
        "positions_top": pos_rows[:15],
        "snapshot": {"path": str(snapshots_dir / f"{run_date}.json"), "mark_date": str(mark_date.date())},
        "pnl_attribution": attribution,
    }
    _write_json(report_dir / "paper_report.json", report)

    if block_reason:
        alerts_dir.mkdir(parents=True, exist_ok=True)
        _write_json(alerts_dir / f"{run_date}.json", {"date": run_date, "reason": block_reason, "equity": equity, "drawdown": stats2["drawdown"]})

    md = []
    md.append("# Paper Trading Daily Report")
    md.append("")
    md.append(f"- run_date: `{run_date}`")
    md.append(f"- signal_as_of: `{sig_as_of}` regime: `{sig_regime}`")
    md.append(f"- mark_date: `{str(mark_date.date())}`")
    md.append(f"- protocol_in_use: `{protocol_in_use}`")
    md.append(f"- execute: `{bool(do_execute)}`")
    if context_obj is not None:
        md.append(
            f"- market_context: stance=`{context_obj.get('recommended_stance','')}` "
            f"risk_score=`{float(context_obj.get('risk_score', 0.0)):.3f}` "
            f"gross_mult=`{float(((context_obj.get('overlay') or {}).get('meta_max_gross_multiplier', 1.0))):.2f}`"
        )
    if block_reason:
        md.append(f"- blocked_reason: `{block_reason}`")
    if portable:
        md.append(f"- portable_ls: `{bool(portable.get('applied'))}` sleeve_gross=`{portable.get('sleeve_gross','')}`")
    md.append(f"- equity: `{equity:.2f}` cash: `{cash:.2f}` gross_exposure: `{gross:.3f}`")
    md.append(f"- daily_return: `{daily_ret:.4f}` drawdown: `{stats2['drawdown']:.4f}` peak_equity: `{stats2['peak_equity']:.2f}`")
    md.append("")
    md.append("## Top positions")
    for r in pos_rows[:15]:
        w = float(r["market_value"]) / max(1e-9, equity)
        md.append(f"- {r['symbol']}: qty={r['qty']:.6f} mv={r['market_value']:.2f} w={w:.3f}")
    md.append("")
    md.append("## PnL attribution (since last mark)")
    if attribution.get("status") == "ok":
        md.append(f"- total_pnl: `{float(attribution.get('total_pnl', 0.0)):.2f}`")
        for r in (attribution.get("by_symbol") or [])[:10]:
            md.append(f"- {r['symbol']}: pnl={float(r['pnl']):.2f} qty={float(r['qty']):.6f}")
    else:
        md.append(f"- {attribution.get('status')}: {attribution.get('reason','')}")
    md.append("")
    md.append("## Artifacts")
    md.append(f"- strategy: `{strat_dir}`")
    md.append(f"- execution: `{exec_dir}`")
    md.append(f"- paper_state: `{paper_state}`")
    md.append(f"- ledger: `{ledger_csv}`")
    md.append(f"- snapshot: `{snapshots_dir / f'{run_date}.json'}`")
    _write_md(report_dir / "paper_report.md", "\n".join(md) + "\n")

    print(json.dumps({"run_dir": str(run_dir), "execute": bool(do_execute), "equity": equity}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
