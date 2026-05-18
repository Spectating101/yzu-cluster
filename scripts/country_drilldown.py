#!/usr/bin/env python3
"""
Country-level drill-down report.

Takes the screener output and groups it by country/region so you can see:
  - Country ETF composite score + factor breakdown
  - Top individual stocks within that country, ranked
  - Where the country sits globally (momentum percentile vs the other countries)
  - A structural narrative for why that country looks the way it does
  - A "trust the growth?" verdict combining momentum + trend + drawdown control

Output: one big markdown report grouping every country with reasoning.

Usage:
  scripts/country_drilldown.py \\
    --panel backtests/outputs/global_drilldown/panel.csv \\
    --out-dir backtests/outputs/global_drilldown
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import pandas as pd

SR_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SR_ROOT))

from src.research.screening import ScreenConfig, screen_universe  # noqa: E402


# Hand-curated country buckets + structural narratives. The narratives are
# durable structural facts about each market (sector concentration, demographic
# story, key risks) — they're context, not forecasts.
COUNTRY_GROUPS: Dict[str, dict] = {
    "United States": {
        "etfs": ["SPY", "QQQ", "IWM", "QUAL", "MOAT", "ARKK"],
        "stocks": ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"],
        "narrative": (
            "Largest, deepest equity market. Mega-cap tech (~30% of S&P 500) "
            "drives most of the index return. AI-capex cycle (NVDA leading) is "
            "the dominant 2024-2026 narrative. Concentration risk: top 7 names "
            "are ~33% of SPY. Quality (QUAL) + moat (MOAT) ETFs offer the "
            "defensive way to own this. Small-cap (IWM) has been the laggard "
            "for 5+ years."
        ),
    },
    "South Korea": {
        "etfs": ["EWY"],
        "stocks": ["005930.KS", "000660.KS", "035420.KS", "005380.KS", "035720.KS"],
        "stock_names": {
            "005930.KS": "Samsung Electronics",
            "000660.KS": "SK Hynix",
            "035420.KS": "Naver",
            "005380.KS": "Hyundai Motor",
            "035720.KS": "Kakao",
        },
        "narrative": (
            "Export-driven economy, semiconductor cycle is the dominant beta. "
            "Samsung + SK Hynix together are ~30% of KOSPI weight and ~50% of "
            "EWY by weight — when DRAM and HBM (high-bandwidth memory for AI) "
            "are in upcycle, EWY rips; when they're in downcycle, it stalls. "
            "2024-2026 is HBM upcycle (SK Hynix is the prime NVDA supplier). "
            "Structural risks: chaebol governance discount, North Korea tail, "
            "won/dollar sensitivity."
        ),
    },
    "Taiwan": {
        "etfs": ["EWT"],
        "stocks": ["2330.TW", "2317.TW", "2454.TW", "2412.TW", "2308.TW"],
        "stock_names": {
            "2330.TW": "TSMC",
            "2317.TW": "Hon Hai (Foxconn)",
            "2454.TW": "MediaTek",
            "2412.TW": "Chunghwa Telecom",
            "2308.TW": "Delta Electronics",
        },
        "narrative": (
            "TSMC alone is ~50% of TWSE and ~25% of EWT. Buying EWT = mostly "
            "buying TSMC. AI-chip leader (manufactures every NVDA + AAPL + AMD "
            "chip). Structural tailwind: foundry oligopoly with only Samsung + "
            "Intel as competition, and Intel is years behind on leading-edge "
            "nodes. Existential risk: cross-strait tension with China — this "
            "is the geopolitical fat tail that doesn't show up in price data."
        ),
    },
    "China (broad + leaders)": {
        "etfs": ["MCHI", "ASHR", "FXI"],
        "stocks": ["BABA", "JD", "PDD", "BIDU", "600519.SS", "601318.SS"],
        "stock_names": {
            "BABA": "Alibaba",
            "JD": "JD.com",
            "PDD": "PDD Holdings (Temu)",
            "BIDU": "Baidu",
            "600519.SS": "Kweichow Moutai",
            "601318.SS": "Ping An Insurance",
        },
        "narrative": (
            "Three different access vehicles: MCHI = US-listed Chinese ADRs "
            "(tech-heavy), ASHR = Shanghai A-shares (domestic onshore, "
            "consumer + financials), FXI = HK-listed large caps. Each tells a "
            "different story. 2022-2023 was the regulatory crackdown bottom; "
            "since then a slow-grind recovery with persistent property-sector "
            "drag. PDD is the standout single-stock momentum story. Structural "
            "risks: VIE legal structure (ADRs), property contagion, US "
            "sanctions, possible delisting of ADRs."
        ),
    },
    "Japan": {
        "etfs": ["EWJ"],
        "stocks": ["TM", "SONY", "6758.T", "7203.T"],
        "stock_names": {
            "TM": "Toyota (ADR)",
            "SONY": "Sony (ADR)",
            "6758.T": "Sony (Tokyo-listed)",
            "7203.T": "Toyota (Tokyo-listed)",
        },
        "narrative": (
            "First inflation in 30 years has triggered corporate governance "
            "reform (TSE pushing companies trading below book value). Buffett "
            "buying the trading houses validated the thesis. Yen weakness "
            "boosts exporter earnings. Risk: BOJ policy normalization could "
            "reverse the carry-trade flow that's been propping up risk assets."
        ),
    },
    "India": {
        "etfs": ["INDA"],
        "stocks": ["INFY", "WIT", "HDB", "IBN"],
        "stock_names": {
            "INFY": "Infosys (ADR)",
            "WIT": "Wipro (ADR)",
            "HDB": "HDFC Bank (ADR)",
            "IBN": "ICICI Bank (ADR)",
        },
        "narrative": (
            "Best secular GDP-growth story among large EMs. Banks (HDB, IBN) "
            "are the cleanest way to play the consumption story. IT services "
            "(INFY, WIT) face GenAI disruption headwinds — their multiples "
            "have compressed. Structural risks: valuation (India trades at a "
            "persistent premium to other EMs), rupee, monsoon, election cycle."
        ),
    },
    "Brazil": {
        "etfs": ["EWZ"],
        "stocks": ["PBR", "VALE", "ITUB"],
        "stock_names": {
            "PBR": "Petrobras",
            "VALE": "Vale",
            "ITUB": "Itaú Unibanco",
        },
        "narrative": (
            "Commodity exporter (iron ore via VALE, oil via PBR). Beta to "
            "China demand. Banks (ITUB) benefit from Brazil's persistently "
            "high real rates. Structural risk: fiscal trajectory, Lula "
            "government policy, currency vol."
        ),
    },
    "Mexico": {
        "etfs": ["EWW"],
        "stocks": ["AMX", "FMX", "CX"],
        "stock_names": {
            "AMX": "América Móvil",
            "FMX": "FEMSA (OXXO)",
            "CX": "Cemex",
        },
        "narrative": (
            "Near-shoring beneficiary as US supply chains move out of China. "
            "FMX/OXXO is a defensive consumer compounder. Risk: Sheinbaum "
            "administration policy uncertainty, USMCA renegotiation in 2026, "
            "Trump tariff exposure."
        ),
    },
    "Argentina / LatAm growth": {
        "etfs": [],
        "stocks": ["GGAL", "YPF"],
        "stock_names": {
            "GGAL": "Grupo Galicia (bank)",
            "YPF": "YPF (oil)",
        },
        "narrative": (
            "Milei reform trade. Extreme volatility. Currency + inflation tail "
            "risk. Single-name only, no broad-Argentina ETF on US exchanges."
        ),
    },
    "Indonesia": {
        "etfs": ["EIDO"],
        "stocks": [],
        "narrative": (
            "Commodity-export economy (nickel, palm oil, coal). 2024-2026 has "
            "been weak: post-Jokowi political transition (Prabowo), "
            "nickel-price collapse hurting export earnings, rupiah weakness. "
            "Demographic tailwind is real but the cyclical setup is rough."
        ),
    },
    "Thailand": {
        "etfs": ["THD"],
        "stocks": [],
        "narrative": "Tourism recovery, China consumer spending dependency.",
    },
    "Turkey": {
        "etfs": ["TUR"],
        "stocks": [],
        "narrative": (
            "Erdogan's belated rate hikes (2023-2024) have stabilized the "
            "lira. Cheap on every traditional metric. High inflation tail."
        ),
    },
    "South Africa": {
        "etfs": ["EZA"],
        "stocks": [],
        "narrative": "Mining + financials. Energy crisis (Eskom) is the swing factor.",
    },
    "Australia / Canada (commodity exporters)": {
        "etfs": ["EWA", "EWC"],
        "stocks": [],
        "narrative": (
            "Both are commodity-export economies with stable governance. EWC "
            "has been the standout 2024-2026 — oil + financials + reasonable "
            "tech exposure. EWA more iron-ore-linked, hence more China beta."
        ),
    },
    "Europe": {
        "etfs": ["EFA", "EWG", "EWU"],
        "stocks": ["SAP", "ASML", "BAYRY"],
        "stock_names": {
            "SAP": "SAP SE (enterprise software)",
            "ASML": "ASML (lithography monopoly)",
            "BAYRY": "Bayer (Roundup overhang)",
        },
        "narrative": (
            "Broad Europe (EFA includes Japan; EWG = Germany pure-play; EWU = "
            "UK). Germany is the persistent underperformer — auto/chemicals "
            "exposure to China + Russia energy shock + slow tech adoption. "
            "ASML is the standout single-name (EUV monopoly = AI capex tax)."
        ),
    },
    "EM broad": {
        "etfs": ["EEM", "VWO", "FM"],
        "stocks": [],
        "narrative": (
            "EEM/VWO are similar broad-EM funds (VWO has no Korea, EEM does — "
            "minor tracking difference). FM = frontier markets, illiquid, "
            "high-vol diversifier."
        ),
    },
    "Defensive / rates": {
        "etfs": ["BIL", "SHY", "TLT", "IEF", "GLD"],
        "stocks": [],
        "narrative": (
            "BIL = T-bills (~5% yield in current rate regime). SHY = short. "
            "IEF = belly. TLT = long duration (volatile, rate-sensitive). "
            "GLD = gold, the true diversifier when both stocks and bonds sell "
            "off together (2022-style)."
        ),
    },
}


def _verdict(row: pd.Series) -> str:
    """Combine momentum + trend + drawdown signals into a plain-English verdict."""
    mom = row.get("mom_12m", 0)
    trend = row.get("trend_strength", 0)
    dd = row.get("max_dd_window", -1)
    sharpe = row.get("sharpe_252", 0)
    score = row.get("composite_score", 0.5)

    flags = []
    if mom > 0.20 and trend > 5 and sharpe > 1.0 and dd > -0.20:
        return "🟢 HIGH CONVICTION (strong momentum + trend + Sharpe, shallow drawdown)"
    if mom > 0.10 and trend > 0 and sharpe > 0.5:
        return "🟡 CONSTRUCTIVE (positive momentum + trend, moderate strength)"
    if mom < 0 and trend < 0:
        return "🔴 AVOID (negative momentum, downtrend)"
    if mom > 0.30 and dd < -0.25:
        return "🟡 LATE CYCLE WARNING (strong run, deep recent drawdown — frothy)"
    if -0.10 < mom < 0.10:
        return "⚪ NEUTRAL (sideways, waiting for confirmation)"
    return "🟡 MIXED SIGNALS"


def _render_country_section(
    country: str,
    spec: dict,
    screen_table: pd.DataFrame,
    global_mom_quantile: pd.Series,
) -> str:
    lines = []
    lines.append(f"## {country}")
    lines.append("")
    lines.append(f"> {spec['narrative']}")
    lines.append("")

    etfs = [t for t in spec.get("etfs", []) if t in screen_table.index]
    stocks = [t for t in spec.get("stocks", []) if t in screen_table.index]

    if etfs:
        lines.append("### ETF view")
        lines.append("| Ticker | Composite | Mom 12m | Trend | Sharpe(1y) | Vol | Max DD(1y) | Global mom rank | Verdict |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---|")
        for t in etfs:
            r = screen_table.loc[t]
            mom_rank = global_mom_quantile.get(t, 0.5)
            lines.append(
                f"| {t} | {r['composite_score']:.3f} | "
                f"{r['mom_12m']*100:+.1f}% | {r['trend_strength']:+.1f} | "
                f"{r['sharpe_252']:+.2f} | {r['ann_vol_realized']*100:.1f}% | "
                f"{r['max_dd_window']*100:.1f}% | "
                f"{int(mom_rank*100)}th pct | {_verdict(r)} |"
            )
        lines.append("")

    if stocks:
        lines.append("### Individual stocks")
        lines.append("| Ticker | Name | Composite | Mom 12m | Trend | Sharpe(1y) | Vol | Verdict |")
        lines.append("|---|---|---:|---:|---:|---:|---:|---|")
        # Rank within country
        stock_table = screen_table.loc[stocks].sort_values("composite_score", ascending=False)
        names = spec.get("stock_names", {})
        for t, r in stock_table.iterrows():
            lines.append(
                f"| {t} | {names.get(t, '')} | {r['composite_score']:.3f} | "
                f"{r['mom_12m']*100:+.1f}% | {r['trend_strength']:+.1f} | "
                f"{r['sharpe_252']:+.2f} | {r['ann_vol_realized']*100:.1f}% | "
                f"{_verdict(r)} |"
            )
        lines.append("")

        # Best-of-country callout
        best = stock_table.iloc[0]
        worst = stock_table.iloc[-1]
        if best.name != worst.name:
            lines.append(
                f"**Best in country:** `{best.name}` "
                f"({names.get(best.name, '')}) — composite {best['composite_score']:.2f}, "
                f"mom_12m {best['mom_12m']*100:+.1f}%."
            )
            lines.append("")
            lines.append(
                f"**Weakest in country:** `{worst.name}` "
                f"({names.get(worst.name, '')}) — composite {worst['composite_score']:.2f}, "
                f"mom_12m {worst['mom_12m']*100:+.1f}%."
            )
            lines.append("")

    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--panel", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, default=SR_ROOT / "backtests" / "outputs" / "global_drilldown")
    ap.add_argument("--lookback-days", type=int, default=252 * 3)
    args = ap.parse_args(argv)

    cfg = ScreenConfig(lookback_days=args.lookback_days)
    res = screen_universe(panel_csv=args.panel, config=cfg)
    tbl = res.table
    # Global momentum percentile (1.0 = best, 0 = worst)
    global_mom_quantile = tbl["mom_12m"].rank(pct=True)

    lines = []
    lines.append("# Global Country / Stock Drill-Down")
    lines.append("")
    lines.append(f"- Panel as-of: `{res.as_of.date()}`")
    lines.append(f"- {len(tbl)} tickers screened across {len(COUNTRY_GROUPS)} country/region buckets")
    lines.append(f"- Lookback: {args.lookback_days} trading days (~{args.lookback_days // 252} years)")
    lines.append("")
    lines.append("## Reading guide")
    lines.append("")
    lines.append("- **Composite score** is a cross-sectional percentile rank of momentum + trend + Sharpe + (low) vol + (shallow) drawdown. 1.0 = best in this universe; 0.0 = worst.")
    lines.append("- **Verdict** is a plain-English combination of momentum / trend / drawdown thresholds, NOT a buy recommendation. Use it as a shortlist filter.")
    lines.append("- **Global mom rank** = where this country's ETF sits in the cross-section of all 73 tickers' 12m momentum.")
    lines.append("")
    lines.append("### Top 10 globally (composite)")
    lines.append("")
    lines.append("| Rank | Ticker | Composite | Mom 12m | Sharpe | Verdict |")
    lines.append("|---:|---|---:|---:|---:|---|")
    for i, (t, r) in enumerate(tbl.head(10).iterrows(), 1):
        lines.append(f"| {i} | {t} | {r['composite_score']:.3f} | {r['mom_12m']*100:+.1f}% | {r['sharpe_252']:+.2f} | {_verdict(r)} |")
    lines.append("")
    lines.append("### Bottom 10 globally (composite)")
    lines.append("")
    lines.append("| Rank | Ticker | Composite | Mom 12m | Sharpe | Verdict |")
    lines.append("|---:|---|---:|---:|---:|---|")
    for i, (t, r) in enumerate(tbl.tail(10).iterrows(), len(tbl) - 9):
        lines.append(f"| {i} | {t} | {r['composite_score']:.3f} | {r['mom_12m']*100:+.1f}% | {r['sharpe_252']:+.2f} | {_verdict(r)} |")
    lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("# Country sections")
    lines.append("")
    for country, spec in COUNTRY_GROUPS.items():
        lines.append(_render_country_section(country, spec, tbl, global_mom_quantile))

    lines.append("---")
    lines.append("")
    lines.append("## Methodology + caveats")
    lines.append("")
    lines.append("- **Composite score is descriptive, not predictive.** Momentum is well-documented (Jegadeesh-Titman 1993), but it crashes when regimes flip — the strongest names get hit first in a reversal.")
    lines.append("- **'Trust the growth?'** The verdict's HIGH CONVICTION tag means *current* signals are aligned. It does NOT mean the trend will continue. Historical hit rate of 12m momentum: roughly 55-60% of months show continuation, 40-45% reversal.")
    lines.append("- **Country narratives are structural facts**, hand-curated, not generated from price data. They give context, not edge.")
    lines.append("- **Tail risk not captured:** China-Taiwan, Korea-DPRK, EM currency crises don't appear in price data until the day they hit. Stress-test before committing meaningful capital.")
    lines.append("- **Valuation is NOT in the score** — a country can be in a strong uptrend AND at a 90th-percentile valuation. Don't confuse momentum strength with cheapness.")
    lines.append("")

    md = "\n".join(lines)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    stamp = pd.Timestamp.utcnow().strftime("%Y%m%d_%H%M%S")
    md_path = args.out_dir / f"country_drilldown_{stamp}.md"
    json_path = args.out_dir / f"country_drilldown_{stamp}.json"
    md_path.write_text(md)

    # JSON artifact
    payload = {
        "as_of": str(res.as_of.date()),
        "universe_size": len(tbl),
        "top_10": tbl.head(10).reset_index().to_dict(orient="records"),
        "bottom_10": tbl.tail(10).reset_index().to_dict(orient="records"),
        "country_summary": {
            country: {
                "etfs": {
                    t: tbl.loc[t][["composite_score", "mom_12m", "trend_strength",
                                    "sharpe_252", "ann_vol_realized", "max_dd_window"]].to_dict()
                    for t in spec.get("etfs", []) if t in tbl.index
                },
                "stocks": {
                    t: tbl.loc[t][["composite_score", "mom_12m", "trend_strength",
                                    "sharpe_252", "ann_vol_realized", "max_dd_window"]].to_dict()
                    for t in spec.get("stocks", []) if t in tbl.index
                },
                "narrative": spec["narrative"],
            }
            for country, spec in COUNTRY_GROUPS.items()
        },
    }
    try:
        from src.research.fingerprint import stamp as _stamp_fp
        _stamp_fp(payload, panel_path=args.panel, config={"args": vars(args)})
    except Exception:
        pass
    json_path.write_text(json.dumps(payload, indent=2, default=str))

    print(md)
    print(f"\nwrote: {md_path}\nwrote: {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
