#!/usr/bin/env python3
from __future__ import annotations

"""
Strict SEC edge paper-trading cycle.

This is the forward-proof path for the repo's strongest current thesis:
  1) build the latest strict-timing SEC signal,
  2) paper-execute it against the file broker,
  3) update a ledger + scorecard,
  4) emit a readiness report.
"""

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

SR_ROOT = Path(__file__).resolve().parents[1]
if str(SR_ROOT) not in sys.path:
    sys.path.insert(0, str(SR_ROOT))

from scripts.alpha_daily_scorecard import build_scorecard, write_outputs  # noqa: E402
from scripts.sec_event_alpha_backtest import build_latest_signal, load_events, load_prices  # noqa: E402
from trading.execution.file_broker import FileBroker  # noqa: E402
from trading.execution.live_signal_executor import (  # noqa: E402
    SafetyConfig,
    compute_rebalance_orders,
    record_execution,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _repo_path(path_like: str | Path) -> Path:
    path = Path(path_like)
    if path.is_absolute():
        return path.resolve()
    if path.parts and path.parts[0] == SR_ROOT.name:
        path = Path(*path.parts[1:]) if len(path.parts) > 1 else Path(".")
    return (SR_ROOT / path).resolve()


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True) + "\n")


def _write_md(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _append_ledger_row(ledger_csv: Path, row: Dict[str, Any]) -> None:
    ledger_csv.parent.mkdir(parents=True, exist_ok=True)
    new_row = pd.DataFrame([row])
    if ledger_csv.exists():
        old = pd.read_csv(ledger_csv)
        combined = pd.concat([old, new_row], ignore_index=True)
    else:
        combined = new_row
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


def _panel_freshness(panel_csv: Path, *, reference_time: Optional[datetime] = None) -> Dict[str, Any]:
    df = pd.read_csv(panel_csv, usecols=["Instrument", "Date"])
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Instrument", "Date"])
    if df.empty:
        raise ValueError(f"Panel is empty: {panel_csv}")
    latest = pd.Timestamp(df["Date"].max()).tz_localize(None)
    earliest = pd.Timestamp(df["Date"].min()).tz_localize(None)
    ref_ts = pd.Timestamp(reference_time or _utc_now()).tz_localize(None)
    age_days = int((ref_ts.normalize() - latest.normalize()).days)
    return {
        "path": str(panel_csv),
        "earliest_date": str(earliest.date()),
        "latest_date": str(latest.date()),
        "age_days": int(age_days),
        "n_rows": int(len(df)),
        "n_instruments": int(df["Instrument"].astype(str).nunique()),
    }


def _readiness_report(
    *,
    panel_info: Dict[str, Any],
    signal: Dict[str, Any],
    score: Dict[str, Any],
    max_panel_staleness_days: int,
    min_ledger_days: int,
    min_sharpe: float,
    max_drawdown: float,
    min_alpha_30d: float,
) -> Dict[str, Any]:
    perf = score.get("performance", {}) or {}
    benchmark = score.get("benchmark", {}) or {}
    period = score.get("period", {}) or {}
    signal_as_of = pd.to_datetime(signal.get("as_of"), errors="coerce")
    latest_panel = pd.to_datetime(panel_info.get("latest_date"), errors="coerce")
    signal_lag_days = None
    if not pd.isna(signal_as_of) and not pd.isna(latest_panel):
        signal_lag_days = int((latest_panel.normalize() - signal_as_of.normalize()).days)

    sharpe = float(perf.get("sharpe_daily_252", float("nan")))
    latest_dd = float(perf.get("latest_drawdown", float("nan")))
    max_dd_seen = float(perf.get("max_drawdown_from_ledger", float("nan")))
    alpha_30d = benchmark.get("alpha_30d")
    alpha_ok = True if alpha_30d is None else bool(float(alpha_30d) >= float(min_alpha_30d))

    checks = {
        "panel_fresh": int(panel_info.get("age_days", 999999)) <= int(max_panel_staleness_days),
        "enough_ledger_history": int(period.get("n_days", 0)) >= int(min_ledger_days),
        "positive_sharpe": bool(math.isfinite(sharpe) and sharpe >= float(min_sharpe)),
        "drawdown_ok": bool(math.isfinite(latest_dd) and latest_dd >= -abs(float(max_drawdown))),
        "max_drawdown_ok": bool(math.isfinite(max_dd_seen) and max_dd_seen >= -abs(float(max_drawdown))),
        "alpha_ok": alpha_ok,
    }
    if signal_lag_days is not None:
        checks["signal_not_ahead_of_panel"] = signal_lag_days >= 0

    if all(checks.values()):
        status = "ready"
    elif checks["panel_fresh"] and checks["enough_ledger_history"]:
        status = "caution"
    else:
        status = "blocked"

    return {
        "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "status": status,
        "checks": checks,
        "panel": panel_info,
        "signal": {
            "path": score.get("positioning", {}).get("signal_path"),
            "as_of": signal.get("as_of"),
            "strategy": signal.get("strategy"),
            "n_weights": int(len(signal.get("weights", {}) or {})),
            "signal_lag_days_vs_panel": signal_lag_days,
        },
        "performance": {
            "period_days": int(period.get("n_days", 0)),
            "cagr_since_start": perf.get("cagr_since_start"),
            "sharpe_daily_252": perf.get("sharpe_daily_252"),
            "sortino_daily_252": perf.get("sortino_daily_252"),
            "latest_drawdown": perf.get("latest_drawdown"),
            "max_drawdown_from_ledger": perf.get("max_drawdown_from_ledger"),
            "return_30d": perf.get("return_30d"),
            "win_rate_30d": perf.get("win_rate_30d"),
            "alpha_30d": alpha_30d,
        },
        "thresholds": {
            "max_panel_staleness_days": int(max_panel_staleness_days),
            "min_ledger_days": int(min_ledger_days),
            "min_sharpe": float(min_sharpe),
            "max_drawdown": float(max_drawdown),
            "min_alpha_30d": float(min_alpha_30d),
        },
    }


def _readiness_markdown(report: Dict[str, Any]) -> str:
    perf = report.get("performance", {}) or {}
    panel = report.get("panel", {}) or {}
    signal = report.get("signal", {}) or {}
    checks = report.get("checks", {}) or {}
    lines = [
        "# SEC Edge Readiness",
        "",
        f"- status: `{report.get('status')}`",
        f"- generated_at: `{report.get('generated_at')}`",
        f"- panel_latest_date: `{panel.get('latest_date')}` age_days=`{panel.get('age_days')}` instruments=`{panel.get('n_instruments')}`",
        f"- signal_as_of: `{signal.get('as_of')}` lag_days_vs_panel=`{signal.get('signal_lag_days_vs_panel')}`",
        f"- period_days: `{perf.get('period_days')}` sharpe=`{perf.get('sharpe_daily_252')}` alpha_30d=`{perf.get('alpha_30d')}`",
        f"- latest_drawdown: `{perf.get('latest_drawdown')}` max_drawdown_from_ledger=`{perf.get('max_drawdown_from_ledger')}`",
        "",
        "## Checks",
        "",
    ]
    for name, ok in checks.items():
        lines.append(f"- {name}: `{ok}`")
    return "\n".join(lines) + "\n"


def _cycle_report(
    *,
    signal: Dict[str, Any],
    mark_date: str,
    execute: bool,
    block_reason: str,
    score: Dict[str, Any],
    readiness: Dict[str, Any],
    orders: List[Dict[str, Any]],
) -> Dict[str, Any]:
    diagnostics = signal.get("diagnostics", {}) or {}
    return {
        "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "strategy": signal.get("strategy"),
        "as_of": signal.get("as_of"),
        "mark_date": str(mark_date),
        "regime": signal.get("regime"),
        "execute": bool(execute),
        "blocked_reason": str(block_reason or ""),
        "selected": diagnostics.get("selected", []),
        "forms": diagnostics.get("forms", {}),
        "event_count": diagnostics.get("event_count"),
        "execution_scale": diagnostics.get("execution_scale"),
        "raw_portfolio_gross": diagnostics.get("raw_portfolio_gross"),
        "scorecard": {
            "sharpe_daily_252": (score.get("performance", {}) or {}).get("sharpe_daily_252"),
            "return_30d": (score.get("performance", {}) or {}).get("return_30d"),
            "alpha_30d": (score.get("benchmark", {}) or {}).get("alpha_30d"),
            "latest_drawdown": (score.get("performance", {}) or {}).get("latest_drawdown"),
        },
        "readiness": {
            "status": readiness.get("status"),
            "checks": readiness.get("checks"),
        },
        "orders": orders,
    }


def _cycle_report_markdown(report: Dict[str, Any]) -> str:
    lines = [
        "# SEC Edge Paper Cycle",
        "",
        f"- strategy: `{report.get('strategy')}`",
        f"- as_of: `{report.get('as_of')}`",
        f"- mark_date: `{report.get('mark_date')}`",
        f"- readiness: `{(report.get('readiness') or {}).get('status')}`",
        f"- execute: `{report.get('execute')}` blocked_reason=`{report.get('blocked_reason')}`",
        f"- selected: `{json.dumps(report.get('selected', []))}`",
        f"- forms: `{json.dumps(report.get('forms', {}), sort_keys=True)}`",
        f"- event_count: `{report.get('event_count')}` raw_portfolio_gross=`{report.get('raw_portfolio_gross')}` execution_scale=`{report.get('execution_scale')}`",
        "",
        "## Orders",
        "",
    ]
    for order in report.get("orders", []):
        lines.append(
            f"- {order.get('side')} {order.get('symbol')}: qty=`{order.get('qty')}` "
            f"notional=`{order.get('notional')}`"
        )
    if not report.get("orders"):
        lines.append("- no orders")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="Strict SEC edge paper-trading cycle.")
    ap.add_argument("--prices", type=Path, default=SR_ROOT / "data_lake" / "yfinance_nasdaq100_plus_spy_10y.csv")
    ap.add_argument("--events", type=Path, default=SR_ROOT / "data_lake" / "sec" / "filing_events_nasdaq100.csv")
    ap.add_argument("--benchmark", type=str, default="SPY")
    ap.add_argument("--cash-symbol", type=str, default="BIL")
    ap.add_argument("--out-root", type=Path, default=SR_ROOT / "backtests" / "outputs" / "sec_edge_paper")
    ap.add_argument("--paper-state", type=Path, default=None)
    ap.add_argument("--paper-live-state", type=Path, default=None)
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--allow-repeat-as-of", action="store_true")
    ap.add_argument("--initial-cash", type=float, default=10_000.0)
    ap.add_argument("--max-turnover", type=float, default=1.0)
    ap.add_argument("--min-order-notional", type=float, default=25.0)
    ap.add_argument("--max-order-notional", type=float, default=100_000.0)
    ap.add_argument("--max-orders", type=int, default=50)
    ap.add_argument("--order-type", choices=["limit", "market"], default="limit")
    ap.add_argument("--limit-buffer-bps", type=float, default=15.0)
    ap.add_argument("--stale-signal-days", type=int, default=5)
    ap.add_argument("--max-panel-staleness-days", type=int, default=5)
    ap.add_argument("--strict-freshness", action="store_true")
    ap.add_argument("--readiness-min-ledger-days", type=int, default=30)
    ap.add_argument("--readiness-min-sharpe", type=float, default=0.0)
    ap.add_argument("--readiness-max-drawdown", type=float, default=0.25)
    ap.add_argument("--readiness-min-alpha-30d", type=float, default=-0.02)

    # SEC edge defaults aligned with the best strict local config.
    ap.add_argument("--top-n", type=int, default=20)
    ap.add_argument("--hold-days", type=int, default=5)
    ap.add_argument("--trade-lag", type=int, default=1)
    ap.add_argument("--gross", type=float, default=1.0)
    ap.add_argument("--cost-bps", type=float, default=10.0)
    ap.add_argument("--target-vol", type=float, default=0.2)
    ap.add_argument("--vol-lookback", type=int, default=20)
    ap.add_argument("--max-gross", type=float, default=2.0)
    ap.add_argument("--cooldown-days", type=int, default=0)
    ap.add_argument("--mom-days", type=int, default=5)
    ap.add_argument("--mom-weight", type=float, default=1.5)
    ap.add_argument("--fallback-mom-weight", type=float, default=0.0)
    ap.add_argument("--form-weight-8k", type=float, default=1.0)
    ap.add_argument("--form-weight-10q", type=float, default=0.0)
    ap.add_argument("--form-weight-10k", type=float, default=0.0)
    ap.add_argument("--filer-penalty-lambda", type=float, default=0.0)
    ap.add_argument("--filer-penalty-lookback", type=int, default=63)
    ap.add_argument("--scale-gross-by-event-count", action="store_true")
    ap.add_argument("--event-timing-mode", choices=["strict_acceptance", "legacy_date"], default="strict_acceptance")
    ap.add_argument(
        "--execution-max-gross",
        type=float,
        default=1.0,
        help="Cap risky gross for paper execution; excess stays in cash.",
    )
    args = ap.parse_args()

    args.prices = _repo_path(args.prices)
    args.events = _repo_path(args.events)
    out_root = _repo_path(args.out_root)
    paper_state = _repo_path(args.paper_state) if args.paper_state is not None else (out_root / "state.json")
    paper_live_state = _repo_path(args.paper_live_state) if args.paper_live_state is not None else (out_root / "live_state.json")
    ledger_csv = out_root / "ledger.csv"
    scorecard_dir = out_root / "scorecard"
    scorecard_history_csv = out_root / "scorecard_history.csv"
    readiness_json = out_root / "edge_readiness_latest.json"
    readiness_md = out_root / "edge_readiness_latest.md"

    panel_info = _panel_freshness(args.prices)
    if bool(args.strict_freshness) and int(panel_info["age_days"]) > int(args.max_panel_staleness_days):
        raise SystemExit(
            f"Panel is stale: latest_date={panel_info['latest_date']} age_days={panel_info['age_days']} > {args.max_panel_staleness_days}"
        )

    now = _utc_now()
    run_date = now.date().isoformat()
    run_dir = out_root / run_date
    strat_dir = run_dir / "strategy"
    exec_dir = run_dir / "execution"
    report_dir = run_dir / "report"
    run_dir.mkdir(parents=True, exist_ok=True)

    if not paper_state.exists():
        _write_json(paper_state, {"cash": float(args.initial_cash), "positions": {}})

    px = load_prices(args.prices)
    ev = load_events(args.events)
    mark_date = pd.Timestamp(px.index.max()).normalize()
    signal = build_latest_signal(
        px,
        ev,
        benchmark=str(args.benchmark),
        top_n=int(args.top_n),
        hold_days=int(args.hold_days),
        trade_lag=int(args.trade_lag),
        gross=float(args.gross),
        cost_bps=float(args.cost_bps),
        mom_days=int(args.mom_days),
        mom_weight=float(args.mom_weight),
        fallback_mom_weight=float(args.fallback_mom_weight),
        form_weights={
            "8-K": float(args.form_weight_8k),
            "10-Q": float(args.form_weight_10q),
            "10-K": float(args.form_weight_10k),
        },
        target_vol=float(args.target_vol),
        vol_lookback=int(args.vol_lookback),
        max_gross=float(args.max_gross),
        cooldown_days=int(args.cooldown_days),
        filer_penalty_lambda=float(args.filer_penalty_lambda),
        filer_penalty_lookback=int(args.filer_penalty_lookback),
        scale_gross_by_event_count=bool(args.scale_gross_by_event_count),
        event_timing_mode=str(args.event_timing_mode),
        cash_symbol=str(args.cash_symbol),
        execution_max_gross=float(args.execution_max_gross),
        strategy_name="sec_event_strict_paper",
    )
    if "error" in signal:
        raise SystemExit(str(signal["error"]))

    signal_path = strat_dir / "signal.json"
    _write_json(signal_path, signal)

    broker = FileBroker(state_json=paper_state, panel_csv=args.prices, cash_symbol=str(args.cash_symbol))
    safety = SafetyConfig(
        cash_symbol=str(args.cash_symbol),
        treat_cash_symbol_as_cash=True,
        max_turnover=float(args.max_turnover),
        min_order_notional=float(args.min_order_notional),
        max_order_notional=float(args.max_order_notional),
        max_orders=int(args.max_orders),
        order_type=str(args.order_type),
        limit_buffer_bps=float(args.limit_buffer_bps),
        stale_signal_days=int(args.stale_signal_days),
        reference_date=str(mark_date.date()),
    )

    block_reason = ""
    try:
        notes, orders = compute_rebalance_orders(
            broker=broker,
            signal=signal,
            safety=safety,
            live_state_path=paper_live_state,
            execute=bool(args.execute),
            allow_repeat_as_of=bool(args.allow_repeat_as_of),
        )
    except Exception as exc:
        block_reason = f"{type(exc).__name__}: {exc}"
        notes, orders = [], []

    proposed_obj = {
        "as_of": str(signal.get("as_of") or ""),
        "regime": str(signal.get("regime") or ""),
        "broker": broker.name,
        "execute": bool(args.execute and not block_reason),
        "blocked_reason": block_reason,
        "notes": notes,
        "orders": [order.__dict__ for order in orders],
    }
    _write_json(exec_dir / "orders_proposed.json", proposed_obj)

    submitted: List[Dict[str, Any]] = []
    if bool(args.execute) and not block_reason:
        for order in orders:
            submitted.append(broker.submit_order(order).__dict__)
        _write_json(exec_dir / "orders_submitted.json", {"submitted": submitted})
        record_execution(
            live_state_path=paper_live_state,
            as_of=str(signal.get("as_of") or ""),
            broker_name=broker.name,
            orders=[order.__dict__ for order in orders],
            results=submitted,
        )

    acct = broker.get_account()
    positions = broker.list_positions()
    pos_rows = sorted(
        [{"symbol": p.symbol, "qty": float(p.qty), "market_value": float(p.market_value)} for p in positions],
        key=lambda r: abs(float(r["market_value"])),
        reverse=True,
    )
    equity = float(acct.equity)
    cash = float(acct.cash)
    gross_exposure = float(sum(abs(float(p["market_value"])) for p in pos_rows)) / max(1e-9, equity)

    daily_return = 0.0
    if ledger_csv.exists():
        prev = pd.read_csv(ledger_csv)
        if not prev.empty and "equity" in prev.columns:
            prev_eq = float(pd.to_numeric(prev["equity"], errors="coerce").dropna().iloc[-1])
            if prev_eq > 0:
                daily_return = float(equity / prev_eq - 1.0)

    stats = _ledger_stats(ledger_csv)
    _append_ledger_row(
        ledger_csv,
        {
            "date": run_date,
            "signal_as_of": str(signal.get("as_of") or ""),
            "mark_date": str(mark_date.date()),
            "regime": str(signal.get("regime") or ""),
            "equity": equity,
            "cash": cash,
            "gross_exposure": gross_exposure,
            "n_positions": int(len(pos_rows)),
            "daily_return": daily_return,
            "drawdown": float(stats.get("drawdown", 0.0)),
            "execute": bool(args.execute and not block_reason),
            "blocked_reason": block_reason,
        },
    )

    score = build_scorecard(ledger_csv=ledger_csv, signal_json=signal_path, panel_csv=args.prices, benchmark=str(args.benchmark))
    score.setdefault("positioning", {})
    score["positioning"]["signal_path"] = str(signal_path)
    write_outputs(score, scorecard_dir, scorecard_history_csv)

    readiness = _readiness_report(
        panel_info=panel_info,
        signal=signal,
        score=score,
        max_panel_staleness_days=int(args.max_panel_staleness_days),
        min_ledger_days=int(args.readiness_min_ledger_days),
        min_sharpe=float(args.readiness_min_sharpe),
        max_drawdown=float(args.readiness_max_drawdown),
        min_alpha_30d=float(args.readiness_min_alpha_30d),
    )
    _write_json(readiness_json, readiness)
    _write_md(readiness_md, _readiness_markdown(readiness))

    report = _cycle_report(
        signal=signal,
        mark_date=str(mark_date.date()),
        execute=bool(args.execute and not block_reason),
        block_reason=block_reason,
        score=score,
        readiness=readiness,
        orders=[order.__dict__ for order in orders],
    )
    _write_json(report_dir / "sec_edge_paper_cycle_report.json", report)
    _write_md(report_dir / "sec_edge_paper_cycle_report.md", _cycle_report_markdown(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
