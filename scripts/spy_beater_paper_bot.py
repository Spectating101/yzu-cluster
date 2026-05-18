#!/usr/bin/env python3
"""
Paper-trading bot wrapper around the leveraged ETF strategy.

What it does:
  - Loads a tidy panel (Instrument, Date, Price_Close, Volume optional)
  - Runs the strategy to compute target weights "for the next bar"
  - Compares to current paper portfolio state and emits rebalance orders
  - Applies simple slippage + costs and persists updated state

Safe by default:
  This is PAPER-only. It does not place live broker orders.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

import numpy as np

import sys

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from spy_beater_leveraged_runner import load_prices, run_engine  # noqa: E402


@dataclass
class PaperState:
    as_of: str
    cash: float
    positions: Dict[str, float]  # shares


def _load_state(path: Path, *, initial_cash: float) -> PaperState:
    if not path.exists():
        return PaperState(as_of="", cash=float(initial_cash), positions={})
    raw = json.loads(path.read_text())
    return PaperState(
        as_of=str(raw.get("as_of", "")),
        cash=float(raw.get("cash", initial_cash)),
        positions={str(k): float(v) for k, v in (raw.get("positions", {}) or {}).items()},
    )


def _save_state(path: Path, state: PaperState) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {"as_of": state.as_of, "cash": state.cash, "positions": state.positions},
            indent=2,
        )
        + "\n"
    )


def _portfolio_value(state: PaperState, prices: Dict[str, float]) -> float:
    v = float(state.cash)
    for sym, sh in state.positions.items():
        px = float(prices.get(sym, 0.0))
        v += float(sh) * px
    return float(v)


def main() -> int:
    ap = argparse.ArgumentParser(description="Paper bot for spy-beater leveraged strategy.")
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--config-json", type=Path, required=True)
    ap.add_argument("--state", type=Path, default=Path("backtests/outputs/spy_beater/paper_state.json"))
    ap.add_argument("--out-dir", type=Path, default=Path("backtests/outputs/spy_beater/paper_bot"))
    ap.add_argument("--initial-cash", type=float, default=10_000.0)
    ap.add_argument("--slippage-bps", type=float, default=1.0)
    ap.add_argument("--fee-bps", type=float, default=1.0)
    ap.add_argument("--min-order-notional", type=float, default=25.0)
    ap.add_argument("--ann-factor", type=float, default=252.0)
    ap.add_argument("--eval-last-year", action="store_true")
    args = ap.parse_args()

    cfg = json.loads(args.config_json.read_text())
    prices_df = load_prices(args.panel)
    if args.eval_last_year:
        end = prices_df.index.max()
        start = prices_df.index[prices_df.index >= (end - np.timedelta64(365, "D"))].min()
        prices_df = prices_df[(prices_df.index >= start) & (prices_df.index <= end)]

    res = run_engine(
        prices_df,
        benchmark=str(cfg.get("benchmark", "SPY")),
        risky=list(cfg.get("risky", ["UPRO", "TQQQ"])),
        defensive=list(cfg.get("defensive", ["TLT", "IEF", "GLD"])),
        inverse=list(cfg.get("inverse", ["SH", "PSQ"])),
        bear_mode=str(cfg.get("bear_mode", "defensive")),
        top_k_risky=int(cfg.get("top_k_risky", 1)),
        top_k_defensive=int(cfg.get("top_k_defensive", 1)),
        rebalance_every=int(cfg.get("rebalance_every", 1)),
        cash=str(cfg.get("cash", "BIL")),
        core_weight=float(cfg.get("core_weight", 0.0)),
        core_to_cash_when_bear=bool(cfg.get("core_to_cash_when_bear", False)),
        ann_factor=float(cfg.get("ann_factor", args.ann_factor)),
        sma_days=int(cfg.get("sma_days", 200)),
        mom_days=int(cfg.get("mom_days", 63)),
        mom_floor=float(cfg.get("mom_floor", -1e9)),
        require_asset_trend=bool(cfg.get("require_asset_trend", False)),
        allocate_residual_to_cash=bool(cfg.get("allocate_residual_to_cash", False)),
        risk_off_vol_lookback=int(cfg.get("risk_off_vol_lookback", 20)),
        risk_off_vol_max=float(cfg.get("risk_off_vol_max", 0.0)),
        risk_off_crash_days=int(cfg.get("risk_off_crash_days", 5)),
        risk_off_crash_ret=float(cfg.get("risk_off_crash_ret", 0.0)),
        risk_off_cooldown_days=int(cfg.get("risk_off_cooldown_days", 21)),
        cppi_floor_frac=float(cfg.get("cppi_floor_frac", 0.0)),
        cppi_multiplier=float(cfg.get("cppi_multiplier", 0.0)),
        crypto_gate=bool(cfg.get("crypto_gate", False)),
        crypto_trend_sma_days=int(cfg.get("crypto_trend_sma_days", 200)),
        crypto_vol_lookback=int(cfg.get("crypto_vol_lookback", 20)),
        crypto_vol_max=float(cfg.get("crypto_vol_max", 0.0)),
        vol_lookback=int(cfg.get("vol_lookback", 20)),
        target_vol=float(cfg.get("target_vol", 0.18)),
        max_gross=float(cfg.get("max_gross", 1.0)),
        dd_stop=float(cfg.get("dd_stop", 0.15)),
        dd_floor_gross=float(cfg.get("dd_floor_gross", 0.0)),
        port_dd_stop=float(cfg.get("port_dd_stop", 0.0)),
        port_dd_cooldown_days=int(cfg.get("port_dd_cooldown_days", 21)),
        rebalance_threshold=float(cfg.get("rebalance_threshold", 0.10)),
        cost_bps=float(cfg.get("cost_bps", 2.0)),
    )
    if "error" in res:
        print(res["error"])
        return 2

    if not res.get("weights"):
        print("No weights produced.")
        return 2

    as_of, w = res["weights"][-1]
    as_of_s = str(getattr(as_of, "date", lambda: as_of)())

    # Use latest available close as "execution price".
    last_px = prices_df.loc[prices_df.index.max()].to_dict()
    last_px = {str(k): float(v) for k, v in last_px.items() if v == v and v is not None}

    state = _load_state(args.state, initial_cash=float(args.initial_cash))
    pv = _portfolio_value(state, last_px)

    # Target dollar holdings.
    target_weights = {str(k): float(v) for k, v in w.items() if float(v) != 0.0}
    target_dollars = {k: pv * float(v) for k, v in target_weights.items()}

    # Current dollars.
    current_dollars = {k: float(state.positions.get(k, 0.0)) * float(last_px.get(k, 0.0)) for k in last_px.keys()}

    orders = []
    slip = float(args.slippage_bps) / 10000.0
    fee = float(args.fee_bps) / 10000.0

    # Flatten positions that are no longer in the target.
    for sym, sh in list(state.positions.items()):
        if sym not in target_dollars and abs(sh) > 0:
            px = float(last_px.get(sym, 0.0))
            notional = float(abs(sh) * px)
            if notional < float(args.min_order_notional) or px <= 0:
                continue
            side = "SELL" if sh > 0 else "BUY"
            fill_px = px * (1 - slip) if side == "SELL" else px * (1 + slip)
            cost = notional * fee
            state.cash += (sh * fill_px) - cost
            state.positions.pop(sym, None)
            orders.append({"symbol": sym, "side": side, "shares": float(abs(sh)), "fill_price": float(fill_px), "fee": float(cost)})

    # Rebalance into targets (long-only).
    for sym, tgt_usd in target_dollars.items():
        px = float(last_px.get(sym, 0.0))
        if px <= 0:
            continue
        cur_usd = float(current_dollars.get(sym, 0.0))
        delta = float(tgt_usd - cur_usd)
        if abs(delta) < float(args.min_order_notional):
            continue
        side = "BUY" if delta > 0 else "SELL"
        fill_px = px * (1 + slip) if side == "BUY" else px * (1 - slip)
        shares = abs(delta) / fill_px
        notional = shares * fill_px
        cost = notional * fee

        if side == "BUY" and (notional + cost) > state.cash:
            # Cap by available cash.
            max_notional = max(0.0, state.cash / (1.0 + fee))
            if max_notional < float(args.min_order_notional):
                continue
            shares = max_notional / fill_px
            notional = shares * fill_px
            cost = notional * fee

        # Apply fill to paper state.
        signed = shares if side == "BUY" else -shares
        state.positions[sym] = float(state.positions.get(sym, 0.0) + signed)
        cash_delta = (-signed * fill_px) - float(cost)
        state.cash += float(cash_delta)
        orders.append({"symbol": sym, "side": side, "shares": float(shares), "fill_price": float(fill_px), "fee": float(cost)})

    state.as_of = as_of_s
    _save_state(args.state, state)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "orders.json").write_text(json.dumps({"as_of": as_of_s, "orders": orders}, indent=2) + "\n")
    (args.out_dir / "signal.json").write_text(
        json.dumps(
            {
                "as_of": as_of_s,
                "meta": res.get("meta")[-1][1] if res.get("meta") else {},
                "weights": target_weights,
            },
            indent=2,
        )
        + "\n"
    )
    (args.out_dir / "state.json").write_text(
        json.dumps(
            {"as_of": state.as_of, "cash": state.cash, "positions": state.positions, "portfolio_value": pv},
            indent=2,
        )
        + "\n"
    )

    print(json.dumps({"as_of": as_of_s, "n_orders": len(orders), "portfolio_value": pv}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
