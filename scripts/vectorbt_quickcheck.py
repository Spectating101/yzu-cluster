#!/usr/bin/env python3
"""
Vectorbt quick diagnostics for Sharpe-Renaissance.
Loads a price CSV and runs a lightweight MA-cross sanity backtest.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


def _max_drawdown_from_returns(rets: pd.Series) -> float:
    eq = (1.0 + rets.fillna(0.0)).cumprod()
    dd = eq / eq.cummax() - 1.0
    return float(dd.min()) if len(dd) else 0.0


def _count_trades(position: pd.Series) -> int:
    # Count entry edges where position flips from 0 to 1.
    if len(position) < 2:
        return 0
    p = position.astype(int).fillna(0)
    entries = (p.diff().fillna(0) > 0).sum()
    return int(entries)


def main() -> int:
    ap = argparse.ArgumentParser(description="vectorbt quick diagnostics")
    ap.add_argument(
        "--prices-csv",
        default="Sharpe-Renaissance/data_lake/yfinance_spy_qqq_10y.csv",
        help="CSV with Date + close column (or Adj Close/Close)",
    )
    ap.add_argument("--fast", type=int, default=20)
    ap.add_argument("--slow", type=int, default=60)
    args = ap.parse_args()

    vbt = None
    vbt_error = None
    try:
        import vectorbt as _vbt  # type: ignore

        vbt = _vbt
    except Exception as e:  # pragma: no cover - fallback path exercised in runtime
        vbt_error = str(e)

    p = Path(args.prices_csv)
    if not p.exists():
        print(json.dumps({"ok": False, "error": f"missing_csv:{p}"}, ensure_ascii=False))
        return 2

    df = pd.read_csv(p)
    cols = {c.lower(): c for c in df.columns}
    close_col = None
    # Exact/normalized candidates first.
    for candidate in ["price_close", "close", "adj close", "adj_close", "price"]:
        if candidate in cols:
            close_col = cols[candidate]
            break
    # Then fuzzy fallback (any column containing 'close').
    if close_col is None:
        for c in df.columns:
            cl = c.lower().strip()
            if "close" in cl:
                close_col = c
                break
    if close_col is None:
        close_col = df.columns[-1]

    if "Date" in df.columns:
        dt = pd.to_datetime(df["Date"], errors="coerce")
        px = pd.to_numeric(df[close_col], errors="coerce")
        series = pd.Series(px.values, index=dt).dropna()
        series = series[~series.index.duplicated(keep="first")]
        price = series.sort_index()
    else:
        price = pd.to_numeric(df[close_col], errors="coerce").dropna().reset_index(drop=True)
    if len(price) < max(args.slow + 5, 100):
        print(json.dumps({"ok": False, "error": "not_enough_rows"}, ensure_ascii=False))
        return 2

    if vbt is not None:
        fast = vbt.MA.run(price, window=int(args.fast)).ma
        slow = vbt.MA.run(price, window=int(args.slow)).ma
        entries = fast > slow
        exits = fast < slow
        pf = vbt.Portfolio.from_signals(price, entries, exits, fees=0.0005)

        rets = pf.returns().dropna()
        mean_r = float(rets.mean()) if len(rets) else 0.0
        std_r = float(rets.std()) if len(rets) else 0.0
        sharpe = (mean_r / std_r) * (252.0 ** 0.5) if std_r > 0 else 0.0

        out = {
            "ok": True,
            "engine": "vectorbt",
            "rows": int(len(price)),
            "close_col": close_col,
            "fast": int(args.fast),
            "slow": int(args.slow),
            "total_return": float(pf.total_return()),
            "sharpe_ratio": float(sharpe),
            "max_drawdown": float(pf.max_drawdown()),
            "trades": int(pf.trades.count()),
        }
    else:
        # Fallback diagnostics when vectorbt is unavailable in this environment.
        fast = price.rolling(int(args.fast)).mean()
        slow = price.rolling(int(args.slow)).mean()
        position = (fast > slow).astype(float).fillna(0.0)
        strat_rets = price.pct_change(fill_method=None).fillna(0.0) * position.shift(1).fillna(0.0)
        eq = (1.0 + strat_rets).cumprod()
        total_return = float(eq.iloc[-1] - 1.0) if len(eq) else 0.0
        mean_r = float(strat_rets.mean()) if len(strat_rets) else 0.0
        std_r = float(strat_rets.std()) if len(strat_rets) else 0.0
        sharpe = (mean_r / std_r) * np.sqrt(252.0) if std_r > 0 else 0.0
        out = {
            "ok": True,
            "engine": "pandas_fallback",
            "fallback_reason": f"vectorbt_not_available: {vbt_error}",
            "rows": int(len(price)),
            "close_col": close_col,
            "fast": int(args.fast),
            "slow": int(args.slow),
            "total_return": float(total_return),
            "sharpe_ratio": float(sharpe),
            "max_drawdown": float(_max_drawdown_from_returns(strat_rets)),
            "trades": int(_count_trades(position)),
        }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
