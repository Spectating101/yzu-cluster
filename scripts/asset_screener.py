#!/usr/bin/env python3
"""
Asset screener + forward portfolio estimate.

Given a universe (ticker file) and a price panel, this script:

  1. Ranks every ticker by a composite factor score (momentum + trend
     + Sharpe + low-vol + shallow-drawdown).
  2. Suggests an allocation across the top names for a chosen profile
     (defensive / balanced / growth).
  3. Estimates the suggested allocation's forward 1-year return
     distribution, expected vol/Sharpe, Monte-Carlo max-drawdown range,
     and historical stress-scenario losses.
  4. Writes a markdown report + JSON artifact with a reproducibility
     fingerprint.

This is decision support, not a forecast. Every estimate carries an
uncertainty band and a caveat list.

Usage:
  scripts/asset_screener.py \\
    --tickers-file config/tickers_international_growth.txt \\
    --panel backtests/outputs/intl_growth_candidate/panel.csv \\
    --profile balanced \\
    --top-n 10 \\
    --out-dir backtests/outputs/screener_runs
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional, Sequence

import pandas as pd

SR_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SR_ROOT))

from src.research.screening import (  # noqa: E402
    ScreenConfig,
    screen_universe,
    suggest_allocation,
)
from src.research.portfolio_estimator import (  # noqa: E402
    EstimatorConfig,
    estimate_portfolio,
    estimate_summary,
)


def _parse_tickers_file(path: Path) -> list:
    out = []
    for line in path.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        out.append(s)
    return out


def _render_markdown(
    *,
    screen,
    weights: pd.Series,
    estimate,
    profile: str,
    initial_dollars: float,
) -> str:
    s = estimate_summary(estimate)
    p = s["portfolio"]
    lines = []
    lines.append(f"# Asset Screener + Portfolio Estimate")
    lines.append("")
    lines.append(f"- As of: `{screen.as_of.date()}`")
    lines.append(f"- Universe: {len(screen.universe)} tickers")
    lines.append(f"- Profile: **{profile}**")
    lines.append(f"- Notional: **${initial_dollars:,.0f}**")
    lines.append("")

    lines.append("## Suggested allocation")
    lines.append("")
    lines.append("| Ticker | Weight | Dollars |")
    lines.append("|---|---:|---:|")
    for t, w in weights.items():
        lines.append(f"| {t} | {w*100:6.2f}% | ${w*initial_dollars:,.0f} |")
    lines.append(f"| **Total** | **{weights.sum()*100:6.2f}%** | **${initial_dollars:,.0f}** |")
    lines.append("")

    lines.append("## Forward expected metrics (1-year horizon)")
    lines.append("")
    lines.append(f"- **Expected annual return (median)**: **{p['return_p50_1y']*100:+.2f}%**")
    lines.append(f"- 5th–95th percentile band: [{p['return_p05_1y']*100:+.2f}%, {p['return_p95_1y']*100:+.2f}%]")
    lines.append(f"- Annual volatility: {p['annual_vol']*100:.2f}%")
    lines.append(f"- Expected Sharpe: {p['expected_sharpe']:.2f}")
    lines.append("")
    lines.append("### Monte-Carlo max drawdown (next 252 trading days)")
    lines.append(f"- Median: **{p['expected_max_drawdown_252d_p50']*100:.2f}%**")
    lines.append(f"- 5th percentile (lucky path): {p['expected_max_drawdown_252d_p95']*100:.2f}%")
    lines.append(f"- 95th percentile (unlucky path): **{p['expected_max_drawdown_252d_p05']*100:.2f}%**")
    lines.append("")
    lines.append("### What that means in dollars on this allocation")
    lines.append(f"- Median 1y outcome: **${initial_dollars * (1 + p['return_p50_1y']):,.0f}** (vs. ${initial_dollars:,.0f} starting)")
    lines.append(f"- Unlucky 1y outcome (5th pct): ${initial_dollars * (1 + p['return_p05_1y']):,.0f}")
    lines.append(f"- Lucky 1y outcome (95th pct): ${initial_dollars * (1 + p['return_p95_1y']):,.0f}")
    lines.append(f"- Typical worst drawdown during the year: ~${initial_dollars * p['expected_max_drawdown_252d_p50']:,.0f}")
    lines.append("")

    lines.append("## Stress scenarios (what THIS allocation would have done in past crises)")
    lines.append("")
    lines.append("| Scenario | Portfolio P&L | Tickers w/ data |")
    lines.append("|---|---:|---:|")
    for row in s["stress"]:
        if row.get("available"):
            lines.append(f"| {row['scenario']} | {row['portfolio_pnl_est']*100:+.2f}% | {row['n_tickers_with_data']} |")
        else:
            lines.append(f"| {row['scenario']} | (no data in panel) | 0 |")
    lines.append("")

    lines.append("## Top picks (factor scoring detail)")
    lines.append("")
    cols = ["composite_score", "mom_12m", "mom_3m", "trend_strength",
            "sharpe_252", "ann_vol_realized", "max_dd_window"]
    head = screen.table[cols].head(min(15, len(screen.table)))
    lines.append("| Ticker | Composite | Mom 12m | Mom 3m | Trend | Sharpe(1y) | Ann Vol | Max DD(1y) |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|")
    for tkr, r in head.iterrows():
        lines.append(
            f"| {tkr} | {r['composite_score']:.3f} | "
            f"{r['mom_12m']*100:+.1f}% | {r['mom_3m']*100:+.1f}% | "
            f"{r['trend_strength']:+.2f} | {r['sharpe_252']:+.2f} | "
            f"{r['ann_vol_realized']*100:.1f}% | {r['max_dd_window']*100:.1f}% |"
        )
    lines.append("")

    if len(screen.table) > 5:
        lines.append("## Bottom of the list (consider underweighting or skipping)")
        lines.append("")
        lines.append("| Ticker | Composite | Mom 12m | Trend | Max DD(1y) |")
        lines.append("|---|---:|---:|---:|---:|")
        tail = screen.table[cols].tail(5).iloc[::-1]
        for tkr, r in tail.iterrows():
            lines.append(
                f"| {tkr} | {r['composite_score']:.3f} | "
                f"{r['mom_12m']*100:+.1f}% | {r['trend_strength']:+.2f} | "
                f"{r['max_dd_window']*100:.1f}% |"
            )
        lines.append("")

    lines.append("## Caveats")
    lines.append("")
    for c in s["caveats"]:
        lines.append(f"- {c}")
    lines.append("")
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tickers-file", type=Path, default=None,
                    help="One ticker per line; if omitted, screens every ticker in the panel.")
    ap.add_argument("--panel", type=Path, required=True,
                    help="Tidy price panel CSV (Instrument, Date, Price_Close[, Volume]).")
    ap.add_argument("--profile", choices=["defensive", "balanced", "growth"], default="balanced")
    ap.add_argument("--top-n", type=int, default=10)
    ap.add_argument("--max-single-weight", type=float, default=0.20)
    ap.add_argument("--cash-floor", type=float, default=0.05)
    ap.add_argument("--cash-ticker", type=str, default="BIL")
    ap.add_argument("--initial-dollars", type=float, default=10_000.0)
    ap.add_argument("--lookback-days", type=int, default=252 * 3)
    ap.add_argument("--estimator-lookback-days", type=int, default=252 * 5)
    ap.add_argument("--risk-free", type=float, default=0.03)
    ap.add_argument("--equity-premium", type=float, default=0.05)
    ap.add_argument("--market-proxy", type=str, default="SPY")
    ap.add_argument("--n-sims", type=int, default=2000)
    ap.add_argument("--out-dir", type=Path, default=SR_ROOT / "backtests" / "outputs" / "screener_runs")
    args = ap.parse_args(argv)

    universe = _parse_tickers_file(args.tickers_file) if args.tickers_file else None
    cfg = ScreenConfig(lookback_days=args.lookback_days, risk_free_annual=args.risk_free)
    screen = screen_universe(panel_csv=args.panel, universe=universe, config=cfg)
    weights = suggest_allocation(
        screen,
        top_n=args.top_n,
        profile=args.profile,
        max_single_weight=args.max_single_weight,
        cash_floor=args.cash_floor,
        cash_ticker=args.cash_ticker,
    )
    est_cfg = EstimatorConfig(
        lookback_days=args.estimator_lookback_days,
        risk_free_annual=args.risk_free,
        equity_premium_annual=args.equity_premium,
        market_proxy=args.market_proxy,
        n_simulations=args.n_sims,
    )
    estimate = estimate_portfolio(weights=weights, panel_csv=args.panel, config=est_cfg)
    summary = estimate_summary(estimate)
    summary["screen_table_head"] = screen.table.head(15).reset_index().to_dict(orient="records")
    summary["as_of"] = str(screen.as_of.date())
    summary["profile"] = args.profile
    summary["initial_dollars"] = args.initial_dollars

    try:
        from src.research.fingerprint import stamp as _stamp_fp

        _stamp_fp(summary, panel_path=args.panel, config={"args": vars(args)})
    except Exception:
        pass

    args.out_dir.mkdir(parents=True, exist_ok=True)
    stamp = pd.Timestamp.utcnow().strftime("%Y%m%d_%H%M%S")
    json_path = args.out_dir / f"screen_{args.profile}_{stamp}.json"
    md_path = args.out_dir / f"screen_{args.profile}_{stamp}.md"
    json_path.write_text(json.dumps(summary, indent=2, default=str))
    md = _render_markdown(screen=screen, weights=weights, estimate=estimate,
                          profile=args.profile, initial_dollars=args.initial_dollars)
    md_path.write_text(md)
    print(md)
    print(f"\nwrote: {json_path}\nwrote: {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
