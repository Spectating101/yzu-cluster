#!/usr/bin/env python3
from __future__ import annotations

"""
Build a deterministic daily MARKET_CONTEXT snapshot from liquid market proxies.

Design goal:
- Keep this fully mechanical and auditable.
- Convert "what's happening in markets" into machine flags and a risk overlay.
- Feed overlays into execution controls (not direct stock picking).
"""

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

SR_ROOT = Path(__file__).resolve().parents[1]
if str(SR_ROOT) not in sys.path:
    sys.path.insert(0, str(SR_ROOT))

from trading.data.providers.base import BarsRequest  # noqa: E402
from trading.data.providers.yfinance_provider import YFinanceProvider  # noqa: E402


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _read_lines(path: Path) -> List[str]:
    out: List[str] = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        out.append(line.split()[0].strip())
    # dedupe preserve order
    seen: set[str] = set()
    uniq: List[str] = []
    for t in out:
        if t and t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(x)))


def _fetch_close(symbols: Sequence[str], lookback_days: int) -> pd.DataFrame:
    now = _utc_now()
    start = now - timedelta(days=max(90, int(lookback_days)))
    provider = YFinanceProvider()
    bars = provider.fetch_bars(BarsRequest(symbols=list(symbols), start=start, end=now, interval="1d"))
    if bars.empty:
        return pd.DataFrame()
    bars = bars.copy()
    bars["timestamp"] = pd.to_datetime(bars["timestamp"], errors="coerce").dt.tz_localize(None)
    close = (
        bars.dropna(subset=["symbol", "timestamp", "close"])
        .pivot_table(index="timestamp", columns="symbol", values="close", aggfunc="last")
        .sort_index()
        .ffill()
    )
    return close


def _series_last(s: pd.Series) -> Optional[float]:
    if s is None or s.empty:
        return None
    v = float(s.iloc[-1])
    if not np.isfinite(v):
        return None
    return v


def _third_friday(d: date) -> date:
    first = date(d.year, d.month, 1)
    days_to_friday = (4 - first.weekday()) % 7
    first_friday = first + timedelta(days=days_to_friday)
    return first_friday + timedelta(days=14)


def _event_windows(today: date) -> Dict[str, Any]:
    month_end = bool(today.day >= 26 or today.day <= 2)
    opex = _third_friday(today)
    days_to_opex = abs((today - opex).days)
    opex_window = bool(days_to_opex <= 2)
    earnings_window = bool(today.month in {1, 4, 7, 10} and 10 <= today.day <= 31)
    return {
        "month_end_window": month_end,
        "opex_window": opex_window,
        "days_to_opex": int(days_to_opex),
        "earnings_window": earnings_window,
        "event_risk_high": bool(month_end or opex_window),
    }


def _news_stats(tickers: Sequence[str], max_items: int = 30) -> Dict[str, Any]:
    try:
        import yfinance as yf
    except Exception:
        return {"news_items": 0, "negative_hits": 0, "negative_ratio": 0.0}

    negative_kw = {
        "downgrade",
        "lawsuit",
        "probe",
        "fraud",
        "bankrupt",
        "default",
        "cuts",
        "cut",
        "layoff",
        "bearish",
        "recession",
        "inflation",
        "war",
        "attack",
        "tariff",
        "sanction",
        "crash",
        "plunge",
        "selloff",
    }
    total = 0
    neg = 0
    by_ticker: Dict[str, Dict[str, Any]] = {}
    for t in tickers:
        try:
            items = list(getattr(yf.Ticker(str(t)), "news", None) or [])[: max(1, int(max_items))]
        except Exception:
            items = []
        cur_total = 0
        cur_neg = 0
        for it in items:
            title = str(it.get("title") or "").lower()
            if not title:
                continue
            cur_total += 1
            if any(k in title for k in negative_kw):
                cur_neg += 1
        total += cur_total
        neg += cur_neg
        by_ticker[str(t)] = {"items": int(cur_total), "negative_hits": int(cur_neg)}

    ratio = float(neg / total) if total > 0 else 0.0
    return {
        "news_items": int(total),
        "negative_hits": int(neg),
        "negative_ratio": float(ratio),
        "by_ticker": by_ticker,
    }


def _breadth_ratio(close: pd.DataFrame, lookback: int = 200) -> Optional[float]:
    if close.empty or len(close.index) < max(60, lookback // 2):
        return None
    sma = close.rolling(int(lookback), min_periods=max(60, lookback // 2)).mean()
    if sma.empty:
        return None
    latest = close.iloc[-1]
    latest_sma = sma.iloc[-1]
    valid = (~latest.isna()) & (~latest_sma.isna())
    if int(valid.sum()) == 0:
        return None
    above = (latest[valid] > latest_sma[valid]).astype(float)
    return float(above.mean())


@dataclass(frozen=True)
class ContextScore:
    risk_score: float
    risk_level: str
    stance: str
    gross_multiplier: float
    reasons: List[str]


def _score_context(flags: Dict[str, Any], metrics: Dict[str, Any]) -> ContextScore:
    score = 0.35
    reasons: List[str] = []

    if not bool(flags.get("trend_risk_on", False)):
        score += 0.14
        reasons.append("SPY/QQQ trend filter not fully risk-on.")
    if bool(flags.get("vol_stress", False)):
        score += 0.18
        reasons.append("Volatility stress from VIX regime.")
    if bool(flags.get("credit_stress", False)):
        score += 0.15
        reasons.append("Credit spread proxy deterioration (HYG/LQD).")
    if bool(flags.get("rates_shock", False)):
        score += 0.08
        reasons.append("Rates/FX shock proxy active (TLT down, UUP up).")
    if bool(flags.get("geopolitical_shock", False)):
        score += 0.16
        reasons.append("Geopolitical shock proxy active (oil/volatility/safe-haven move).")
    breadth = metrics.get("breadth_above_200dma")
    if breadth is not None and float(breadth) < 0.50:
        score += 0.12
        reasons.append("Weak breadth (<50% above 200DMA).")
    if bool(flags.get("news_stress", False)):
        score += 0.08
        reasons.append("Headline tone tilted negative.")
    if bool(flags.get("event_risk_high", False)):
        score += 0.08
        reasons.append("Index-flow/event window active (month-end or OPEX).")

    score = float(_clamp(score, 0.0, 1.0))
    if score >= 0.75:
        risk_level = "high"
    elif score >= 0.55:
        risk_level = "medium"
    else:
        risk_level = "low"

    if score >= 0.68:
        stance = "risk_off"
    elif score <= 0.40:
        stance = "risk_on"
    else:
        stance = "neutral"

    gross_mult = float(round(_clamp(1.08 - 0.75 * score, 0.50, 1.05), 2))
    return ContextScore(
        risk_score=score,
        risk_level=risk_level,
        stance=stance,
        gross_multiplier=gross_mult,
        reasons=reasons,
    )


def _build_context(
    *,
    core_close: pd.DataFrame,
    breadth_close: Optional[pd.DataFrame],
    news: Dict[str, Any],
    today: date,
) -> Dict[str, Any]:
    metrics: Dict[str, Any] = {}
    flags: Dict[str, Any] = {}

    # Core trend / stress indicators.
    for sym in ["SPY", "QQQ", "TLT", "UUP", "^VIX", "HYG", "LQD", "GLD", "XLE", "BZ=F"]:
        if sym in core_close.columns:
            metrics[f"{sym}_last"] = _series_last(core_close[sym])

    core_rets5 = core_close.pct_change(5)
    core_rets20 = core_close.pct_change(20)
    core_rets63 = core_close.pct_change(63)
    for sym in ["SPY", "QQQ", "TLT", "UUP", "^VIX", "HYG", "LQD", "GLD", "XLE", "BZ=F"]:
        if sym in core_rets5.columns:
            metrics[f"{sym}_ret5"] = _series_last(core_rets5[sym])
        if sym in core_rets20.columns:
            metrics[f"{sym}_ret20"] = _series_last(core_rets20[sym])
        if sym in core_rets63.columns:
            metrics[f"{sym}_ret63"] = _series_last(core_rets63[sym])

    sma200 = core_close.rolling(200, min_periods=120).mean()
    spy_trend = None
    qqq_trend = None
    if "SPY" in core_close.columns and "SPY" in sma200.columns:
        last_spy = _series_last(core_close["SPY"])
        last_spy_sma = _series_last(sma200["SPY"])
        if last_spy is not None and last_spy_sma is not None:
            spy_trend = bool(last_spy > last_spy_sma)
    if "QQQ" in core_close.columns and "QQQ" in sma200.columns:
        last_qqq = _series_last(core_close["QQQ"])
        last_qqq_sma = _series_last(sma200["QQQ"])
        if last_qqq is not None and last_qqq_sma is not None:
            qqq_trend = bool(last_qqq > last_qqq_sma)

    trend_risk_on = bool(spy_trend is True and qqq_trend is True)
    flags["spy_above_200dma"] = bool(spy_trend) if spy_trend is not None else False
    flags["qqq_above_200dma"] = bool(qqq_trend) if qqq_trend is not None else False
    flags["trend_risk_on"] = bool(trend_risk_on)

    hyg_lqd_series: Optional[pd.Series] = None
    if "HYG" in core_close.columns and "LQD" in core_close.columns:
        hyg_lqd_series = (core_close["HYG"] / core_close["LQD"]).replace([np.inf, -np.inf], np.nan).dropna()
    if hyg_lqd_series is not None and not hyg_lqd_series.empty:
        metrics["hyg_lqd_last"] = _series_last(hyg_lqd_series)
        metrics["hyg_lqd_ret21"] = _series_last(hyg_lqd_series.pct_change(21))
        hl_sma = _series_last(hyg_lqd_series.rolling(63, min_periods=31).mean())
        hl_last = _series_last(hyg_lqd_series)
        flags["credit_stress"] = bool(
            (metrics.get("hyg_lqd_ret21") is not None and float(metrics["hyg_lqd_ret21"]) < -0.02)
            or (hl_last is not None and hl_sma is not None and hl_last < hl_sma)
        )
    else:
        flags["credit_stress"] = False

    vix_series = core_close["^VIX"] if "^VIX" in core_close.columns else None
    if vix_series is not None and not vix_series.dropna().empty:
        vix_series = vix_series.dropna()
        vix_last = _series_last(vix_series)
        vix_mu = _series_last(vix_series.rolling(252, min_periods=80).mean())
        vix_sd = _series_last(vix_series.rolling(252, min_periods=80).std(ddof=0))
        vix_z = None
        if vix_last is not None and vix_mu is not None and vix_sd is not None and vix_sd > 0:
            vix_z = float((vix_last - vix_mu) / vix_sd)
        metrics["vix_zscore_1y"] = vix_z
        flags["vol_stress"] = bool((vix_last is not None and vix_last >= 22.0) or (vix_z is not None and vix_z >= 1.25))
    else:
        flags["vol_stress"] = False

    tlt_ret20 = metrics.get("TLT_ret20")
    uup_ret20 = metrics.get("UUP_ret20")
    flags["rates_shock"] = bool(
        (tlt_ret20 is not None and float(tlt_ret20) <= -0.03)
        and (uup_ret20 is not None and float(uup_ret20) >= 0.015)
    )

    oil_ret5 = metrics.get("BZ=F_ret5")
    vix_ret5 = metrics.get("^VIX_ret5")
    gld_ret5 = metrics.get("GLD_ret5")
    xle_ret5 = metrics.get("XLE_ret5")
    uup_ret5 = metrics.get("UUP_ret5")
    geopol_shock = False
    if oil_ret5 is not None and vix_ret5 is not None:
        geopol_shock = bool(float(oil_ret5) >= 0.07 and float(vix_ret5) >= 0.08)
    if not geopol_shock and oil_ret5 is not None and gld_ret5 is not None:
        geopol_shock = bool(float(oil_ret5) >= 0.08 and float(gld_ret5) >= 0.015)
    if not geopol_shock and oil_ret5 is not None and xle_ret5 is not None and uup_ret5 is not None:
        geopol_shock = bool(float(oil_ret5) >= 0.08 and float(xle_ret5) >= 0.03 and float(uup_ret5) >= 0.008)
    flags["geopolitical_shock"] = bool(geopol_shock)

    breadth = None
    if breadth_close is not None and not breadth_close.empty:
        breadth = _breadth_ratio(breadth_close, lookback=200)
    metrics["breadth_above_200dma"] = breadth
    flags["breadth_weak"] = bool(breadth is not None and float(breadth) < 0.50)

    metrics["news_items"] = int(news.get("news_items", 0))
    metrics["news_negative_ratio"] = float(news.get("negative_ratio", 0.0))
    flags["news_stress"] = bool(
        metrics["news_items"] >= 8 and metrics["news_negative_ratio"] >= 0.40
    )

    ev = _event_windows(today)
    flags.update(ev)

    scored = _score_context(flags, metrics)
    return {
        "as_of": _utc_now().isoformat(),
        "source": "market_context_daily_v1",
        "risk_score": float(scored.risk_score),
        "risk_level": scored.risk_level,
        "recommended_stance": scored.stance,
        "overlay": {
            "meta_max_gross_multiplier": float(scored.gross_multiplier),
            "ticker_banned": [],
            "sector_banned": [],
        },
        "flags": flags,
        "metrics": metrics,
        "news": news,
        "reasoning": {
            "method": "deterministic_heuristic_v1",
            "drivers": scored.reasons,
        },
    }


def _render_md(ctx: Dict[str, Any]) -> str:
    flags = ctx.get("flags") or {}
    metrics = ctx.get("metrics") or {}
    reason = (ctx.get("reasoning") or {}).get("drivers") or []
    lines: List[str] = []
    lines.append("# Daily Market Context")
    lines.append("")
    lines.append(f"- as_of: `{ctx.get('as_of','')}`")
    lines.append(f"- stance: `{ctx.get('recommended_stance','')}`")
    lines.append(f"- risk_level: `{ctx.get('risk_level','')}`")
    lines.append(f"- risk_score: `{float(ctx.get('risk_score', 0.0)):.3f}`")
    lines.append(f"- gross_multiplier: `{float((ctx.get('overlay') or {}).get('meta_max_gross_multiplier', 1.0)):.2f}`")
    lines.append("")
    lines.append("## Flags")
    for k in sorted(flags.keys()):
        lines.append(f"- {k}: `{flags[k]}`")
    lines.append("")
    lines.append("## Core metrics")
    core_keys = [
        "SPY_last",
        "QQQ_last",
        "^VIX_last",
        "BZ=F_last",
        "GLD_last",
        "XLE_last",
        "SPY_ret5",
        "QQQ_ret5",
        "^VIX_ret5",
        "BZ=F_ret5",
        "GLD_ret5",
        "XLE_ret5",
        "SPY_ret20",
        "QQQ_ret20",
        "TLT_ret20",
        "UUP_ret20",
        "hyg_lqd_ret21",
        "vix_zscore_1y",
        "breadth_above_200dma",
        "news_items",
        "news_negative_ratio",
    ]
    for k in core_keys:
        if k in metrics:
            v = metrics[k]
            if isinstance(v, float):
                lines.append(f"- {k}: `{v:.6f}`")
            else:
                lines.append(f"- {k}: `{v}`")
    lines.append("")
    lines.append("## Why")
    if reason:
        for r in reason:
            lines.append(f"- {r}")
    else:
        lines.append("- No elevated risk drivers triggered.")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description="Build MARKET_CONTEXT from daily market data proxies.")
    ap.add_argument("--out-json", type=Path, default=Path("MARKET_CONTEXT.json"))
    ap.add_argument("--out-md", type=Path, default=Path("Sharpe-Renaissance/backtests/outputs/market_context/latest.md"))
    ap.add_argument(
        "--core-symbols",
        nargs="*",
        default=["SPY", "QQQ", "TLT", "UUP", "^VIX", "HYG", "LQD", "GLD", "XLE", "BZ=F"],
        help="Symbols used for trend/stress proxies.",
    )
    ap.add_argument("--lookback-days", type=int, default=700)
    ap.add_argument(
        "--breadth-tickers-file",
        type=Path,
        default=Path("Sharpe-Renaissance/config/tickers_nasdaq100.txt"),
    )
    ap.add_argument("--max-breadth-tickers", type=int, default=60)
    ap.add_argument("--news-tickers", nargs="*", default=["SPY", "QQQ", "^VIX"])
    ap.add_argument("--news-max-items", type=int, default=30)
    args = ap.parse_args()

    core_symbols = [str(s).strip() for s in args.core_symbols if str(s).strip()]
    if not core_symbols:
        raise SystemExit("No core symbols provided.")

    core_close = _fetch_close(core_symbols, lookback_days=int(args.lookback_days))
    if core_close.empty:
        raise SystemExit("Failed to fetch core market proxies.")

    breadth_close: Optional[pd.DataFrame] = None
    bfile = Path(args.breadth_tickers_file)
    if bfile.exists():
        btickers = _read_lines(bfile)
        if btickers:
            btickers = btickers[: max(5, int(args.max_breadth_tickers))]
            breadth_close = _fetch_close(btickers, lookback_days=max(380, int(args.lookback_days)))
            if not breadth_close.empty:
                breadth_close = breadth_close.reindex(sorted(breadth_close.columns), axis=1)

    news = _news_stats(args.news_tickers, max_items=int(args.news_max_items))
    today = _utc_now().date()
    ctx = _build_context(core_close=core_close, breadth_close=breadth_close, news=news, today=today)

    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(ctx, indent=2) + "\n")
    md = _render_md(ctx)
    args.out_md.parent.mkdir(parents=True, exist_ok=True)
    args.out_md.write_text(md)

    print(
        json.dumps(
            {
                "out_json": str(args.out_json),
                "out_md": str(args.out_md),
                "stance": ctx.get("recommended_stance"),
                "risk_score": ctx.get("risk_score"),
                "gross_mult": (ctx.get("overlay") or {}).get("meta_max_gross_multiplier"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
