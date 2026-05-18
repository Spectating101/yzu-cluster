#!/usr/bin/env python3
"""
Fetch Cite-Finance outputs and save them as local JSON "snapshots" for offline use.

This is the safest integration pattern for Sharpe-Renaissance:
- network/API call happens once
- results are frozen to disk
- research/backtests consume the snapshot deterministically
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

SR_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SR_ROOT))

from src.integrations.cite_finance_client import CiteFinanceClient, CiteFinanceConfig


def _load_price_data_from_panel(panel_csv: Path, ticker: str, *, max_rows: int = 600) -> List[Dict[str, Any]]:
    import pandas as pd

    df = pd.read_csv(panel_csv)
    need = {"Instrument", "Date", "Price_Close"}
    if not need.issubset(df.columns):
        raise ValueError(f"Panel must include columns: {sorted(need)}")

    df = df[df["Instrument"].astype(str) == str(ticker)].copy()
    if df.empty:
        return []
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Price_Close"]).sort_values("Date").drop_duplicates(subset=["Date"], keep="last")
    if len(df) > max_rows:
        df = df.iloc[-max_rows:].copy()

    out: List[Dict[str, Any]] = []
    for r in df.itertuples(index=False):
        out.append(
            {
                "date": getattr(r, "Date").isoformat(),
                "open": float(getattr(r, "Price_Close")),
                "high": float(getattr(r, "Price_Close")),
                "low": float(getattr(r, "Price_Close")),
                "close": float(getattr(r, "Price_Close")),
                "volume": float(getattr(r, "Volume")) if hasattr(r, "Volume") and getattr(r, "Volume") == getattr(r, "Volume") else None,
            }
        )
    return out


async def _direct_fetch_metrics(ticker: str, metrics: List[str], period: Optional[str]) -> Any:
    """
    In-process fetch using cite-finance-api modules (no HTTP server required).

    Notes:
    - Requires outbound internet (SEC).
    - Avoids DB/Redis/API-key requirements.
    """
    import os

    # Import from sibling repo.
    sys.path.insert(0, str(SR_ROOT.parent / "cite-finance-api"))
    from src.data_sources.sec_edgar import SECEdgarSource  # type: ignore

    user_agent = os.getenv("SEC_USER_AGENT", "Cite-Finance/Dev (contact: dev@example.com)")
    src = SECEdgarSource({"user_agent": user_agent})
    try:
        # Bound runtime so a blocked network doesn't hang the whole run.
        import asyncio

        out = await asyncio.wait_for(
            src.get_financial_data(ticker=ticker, concepts=list(metrics), period=period),
            timeout=25,
        )
        # Convert pydantic models to plain dicts.
        return [x.model_dump() for x in out]
    except Exception as e:
        return {"error": type(e).__name__, "message": str(e)}
    finally:
        try:
            # Best-effort cleanup
            session = getattr(src, "session", None)
            if session is not None and not session.closed:
                await session.close()
        except Exception:
            pass


async def _direct_fetch_insights_from_yfinance(ticker: str, *, min_confidence: float, types: Optional[List[str]]) -> Any:
    """
    In-process insights generation using cite-finance-api's InsightsEngine + MarketDataSource.

    Notes:
    - Requires outbound internet (Yahoo).
    - yfinance behavior varies by environment; this is best-effort.
    """
    sys.path.insert(0, str(SR_ROOT.parent / "cite-finance-api"))
    from src.data_sources.market_data import MarketDataSource, MarketDataInterval  # type: ignore
    from src.intelligence.insights_engine import InsightsEngine  # type: ignore

    market = MarketDataSource({})
    import asyncio

    prices = await asyncio.wait_for(
        market.get_historical_prices(ticker=ticker, period="6mo", interval=MarketDataInterval.ONE_DAY),
        timeout=25,
    )
    engine = InsightsEngine()
    insights = await asyncio.wait_for(
        engine.generate_all_insights(ticker=ticker, price_data=prices, quote_data=None, sentiment_data=None),
        timeout=25,
    )

    if types:
        want = {str(t) for t in types}
        insights = [i for i in insights if getattr(i, "insight_type", None) in want]
    insights = [i for i in insights if float(getattr(i, "confidence", 0.0)) >= float(min_confidence)]
    return [i.__dict__ for i in insights]


def _http_fetch(ticker: str, *, metrics: List[str], period: Optional[str], types: List[str], min_confidence: float) -> Dict[str, Any]:
    cfg = CiteFinanceConfig.from_env()
    if cfg is None:
        print("Missing env vars: CITE_FINANCE_BASE_URL and (CITE_FINANCE_API_KEY or CITE_FINANCE_NO_AUTH=1)")
        raise SystemExit(2)
    cli = CiteFinanceClient(cfg)
    return {
        "ticker": ticker,
        "metrics": cli.metrics(ticker=ticker, metrics=list(metrics), period=period),
        "insights": cli.insights(ticker=ticker, types=list(types), min_confidence=float(min_confidence)),
    }


def main() -> int:
    p = argparse.ArgumentParser(description="Fetch Cite-Finance snapshots to disk.")
    p.add_argument("--out-dir", type=Path, default=SR_ROOT / "data_lake" / "cite_finance_snapshots")
    p.add_argument("--ticker", type=str, required=True)
    p.add_argument("--metrics", nargs="*", default=["revenue", "netIncome"])
    p.add_argument("--no-metrics", action="store_true", help="Skip fundamentals/metrics fetch.")
    p.add_argument("--period", type=str, default=None)
    p.add_argument("--min-confidence", type=float, default=0.7)
    p.add_argument("--types", nargs="*", default=["momentum", "risk", "trend", "anomaly"])
    p.add_argument("--mode", choices=["http", "direct"], default="http")
    p.add_argument("--panel", type=Path, default=None, help="Optional tidy panel CSV for offline price-based insights.")
    p.add_argument(
        "--insights-source",
        choices=["panel", "yfinance", "none"],
        default="panel",
        help="Where to generate insights in direct mode (panel requires --panel).",
    )
    args = p.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    ticker = str(args.ticker).upper()

    if args.mode == "http":
        out = _http_fetch(
            ticker,
            metrics=[] if args.no_metrics else list(args.metrics),
            period=args.period,
            types=list(args.types),
            min_confidence=float(args.min_confidence),
        )
    else:
        import asyncio

        out: Dict[str, Any] = {"ticker": ticker}
        if args.no_metrics:
            out["metrics"] = []
        else:
            out["metrics"] = asyncio.run(_direct_fetch_metrics(ticker, list(args.metrics), args.period))

        src = str(args.insights_source)
        if src == "none":
            out["insights"] = []
        elif src == "panel":
            if args.panel is None:
                raise SystemExit("--panel is required when --insights-source panel")
            from src.intelligence.insights_engine import InsightsEngine

            engine = InsightsEngine()
            prices = _load_price_data_from_panel(args.panel, ticker)
            insights = asyncio.run(engine.generate_all_insights(ticker=ticker, price_data=prices, quote_data=None))
            if args.types:
                want = {str(t) for t in args.types}
                insights = [i for i in insights if getattr(i, "insight_type", None) in want]
            insights = [i for i in insights if float(getattr(i, "confidence", 0.0)) >= float(args.min_confidence)]
            out["insights"] = [i.__dict__ for i in insights]
        else:
            out["insights"] = asyncio.run(
                _direct_fetch_insights_from_yfinance(ticker, min_confidence=float(args.min_confidence), types=list(args.types))
            )

    (args.out_dir / f"{ticker}.json").write_text(json.dumps(out, indent=2))
    print(f"Wrote {args.out_dir / f'{ticker}.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
