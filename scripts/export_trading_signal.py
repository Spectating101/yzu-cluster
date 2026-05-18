#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Optional


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")


def _as_float_map(series) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for k, v in series.items():
        try:
            fv = float(v)
        except Exception:
            continue
        if fv != 0.0:
            out[str(k)] = fv
    return out


def _weight_summary(weights: Dict[str, float]) -> Dict[str, float]:
    if not weights:
        return {"sum": 0.0, "max": 0.0}
    vals = list(weights.values())
    return {"sum": float(sum(vals)), "max": float(max(vals))}


def _multi_asset_signal(
    *,
    panel: Path,
    assets_file: Path,
    config: Dict[str, Any],
    out: Path,
    cash_proxy: str,
    portfolio_usd: float,
    min_median_dollar_volume: float,
    slippage_bps: float,
    slippage_cap_bps: float,
    slippage_ref_participation: float,
) -> int:
    import importlib.util
    import sys

    sr_root = Path(__file__).resolve().parents[1]
    mod_path = sr_root / "scripts/multi_asset_trend_runner.py"
    spec = importlib.util.spec_from_file_location("multi_asset_trend_runner", str(mod_path))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module from {mod_path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)

    prices, vols = mod.load_prices(panel)
    assets = [
        l.strip()
        for l in assets_file.read_text().splitlines()
        if l.strip() and not l.strip().startswith("#")
    ]

    res = mod.run_trend_backtest(
        prices_daily=prices,
        volumes_daily=vols,
        assets=assets,
        cash_proxy=cash_proxy,
        lookback_months=list(config.get("lookback_months", [12])),
        ma_months=list(config.get("ma_months", [10])),
        vol_months=int(config.get("vol_months", 12)),
        min_history_months=24,
        max_weight=float(config.get("max_weight", 0.35)),
        rebalance_months=1,
        side=str(config.get("side", "long_only")),
        signal_combine=str(config.get("signal_combine", "sum")),
        signal_threshold=float(config.get("signal_threshold", 0.0)),
        signal_smooth_months=int(config.get("signal_smooth_months", 1)),
        cost_bps=float(config.get("cost_bps", 2.5)),
        slippage_bps=float(slippage_bps),
        slippage_cap_bps=float(slippage_cap_bps),
        slippage_ref_participation=float(slippage_ref_participation),
        portfolio_usd=float(portfolio_usd),
        min_median_dollar_volume=float(min_median_dollar_volume),
        dollar_volume_lookback_months=12,
        target_vol=float(config.get("target_vol", 0.12)),
        vol_target_lookback_months=12,
        max_leverage=float(config.get("max_leverage", 1.5)),
        dd_throttle=float(config.get("dd_throttle", 0.20)),
        dd_floor_exposure=float(config.get("dd_floor_exposure", 0.50)),
    )
    if "error" in res:
        print(res["error"])
        return 2

    weights_hist = list(res.get("weights") or [])
    if not weights_hist:
        print("No weights history produced.")
        return 2
    as_of, weights = weights_hist[-1]

    vt_scale = res.get("vt_scale")
    dd_scale = res.get("dd_scale")
    gross_scale = 1.0
    try:
        if vt_scale is not None and as_of in vt_scale.index:
            gross_scale *= float(vt_scale.loc[as_of])
        if dd_scale is not None and as_of in dd_scale.index:
            gross_scale *= float(dd_scale.loc[as_of])
    except Exception:
        gross_scale = 1.0

    payload = {
        "strategy": "multi_asset_trend",
        "as_of_month": str(getattr(as_of, "date", lambda: as_of)()),
        "gross_scale": float(gross_scale),
        "weights": _as_float_map(weights),
        "inputs": {
            "panel": str(panel),
            "assets_file": str(assets_file),
            "cash_proxy": cash_proxy,
            "portfolio_usd": float(portfolio_usd),
            "min_median_dollar_volume": float(min_median_dollar_volume),
            "slippage_bps": float(slippage_bps),
            "slippage_cap_bps": float(slippage_cap_bps),
            "slippage_ref_participation": float(slippage_ref_participation),
        },
        "params": {k: config.get(k) for k in sorted(config.keys())},
        "weight_summary": _weight_summary(_as_float_map(weights)),
        "notes": [
            "This is a research signal export for evaluation; it is not execution code.",
            "Weights are monthly and intended to be held until next rebalance; apply your own compliance/risk checks.",
        ],
    }
    _write_json(out, payload)
    print(f"Wrote signal: {out}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Export a deterministic 'signal.json' from research configs.")
    p.add_argument("--mode", choices=["multi-asset"], default="multi-asset")
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument("--config-json", type=Path, required=True, help="Path to a best.json (e.g. robust sweep output).")
    p.add_argument("--out", type=Path, default=Path("backtests/outputs/signals/signal.json"))
    p.add_argument("--assets-file", type=Path, default=Path("config/tickers_multi_asset_core.txt"))
    p.add_argument("--cash-proxy", type=str, default="BIL")
    p.add_argument("--portfolio-usd", type=float, default=250000.0)
    p.add_argument("--min-median-dollar-volume", type=float, default=10_000_000.0)
    p.add_argument("--slippage-bps", type=float, default=2.0)
    p.add_argument("--slippage-cap-bps", type=float, default=25.0)
    p.add_argument("--slippage-ref-participation", type=float, default=0.001)
    args = p.parse_args()

    cfg = _read_json(args.config_json)
    # robust_multi_asset_research best.json contains metrics; keep only knobs we need
    keep = {
        "lookback_months",
        "ma_months",
        "vol_months",
        "target_vol",
        "dd_throttle",
        "dd_floor_exposure",
        "cost_bps",
        "signal_threshold",
        "signal_smooth_months",
    }
    cfg = {k: cfg[k] for k in cfg.keys() if k in keep}

    if args.mode == "multi-asset":
        return _multi_asset_signal(
            panel=args.panel,
            assets_file=args.assets_file,
            config=cfg,
            out=args.out,
            cash_proxy=args.cash_proxy,
            portfolio_usd=args.portfolio_usd,
            min_median_dollar_volume=args.min_median_dollar_volume,
            slippage_bps=args.slippage_bps,
            slippage_cap_bps=args.slippage_cap_bps,
            slippage_ref_participation=args.slippage_ref_participation,
        )

    raise SystemExit("Unsupported mode")


if __name__ == "__main__":
    raise SystemExit(main())
