#!/usr/bin/env python3
"""
Lightweight API to serve Refinitiv analytics (factors, distress, coverage).

Usage:
  uvicorn scripts.refinitiv_api:app --reload
"""
from pathlib import Path
from functools import lru_cache
from typing import List, Dict

import pandas as pd
from fastapi import FastAPI, HTTPException

ANALYTICS_BASE = Path(__file__).resolve().parent.parent / "data_lake" / "analytics_pack"

app = FastAPI(title="Refinitiv Analytics API", version="0.1.0")


@lru_cache(maxsize=1)
def _list_tickers() -> List[str]:
    tickers = []
    for pq in ANALYTICS_BASE.glob("factors_*.parquet"):
        t = pq.stem.replace("factors_", "").replace("_", ".")
        tickers.append(t)
    return sorted(set(tickers))


def _load_latest_factors(ticker: str) -> Dict:
    path = next(ANALYTICS_BASE.glob(f"factors_{ticker.replace('.', '_')}*.parquet"), None)
    if not path or not path.exists():
        raise FileNotFoundError
    df = pd.read_parquet(path)
    latest = df[df.notna().any(axis=1)].tail(1)
    if latest.empty:
        return {}
    return latest.to_dict(orient="records")[0]


def _load_distress(ticker: str) -> Dict:
    path = ANALYTICS_BASE / "summary" / "distress_scores.csv"
    if not path.exists():
        return {}
    df = pd.read_csv(path)
    row = df[df["ticker"] == ticker]
    if row.empty:
        return {}
    return {"distress_score": float(row.iloc[0]["distress_score"])}


@app.get("/tickers")
def list_tickers():
    return {"tickers": _list_tickers()}


@app.get("/factors/{ticker}")
def get_factors(ticker: str):
    try:
        factors = _load_latest_factors(ticker)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Ticker not found")
    return {"ticker": ticker, "factors": factors}


@app.get("/distress/{ticker}")
def get_distress(ticker: str):
    distress = _load_distress(ticker)
    if not distress:
        raise HTTPException(status_code=404, detail="Ticker not found or no distress score")
    return {"ticker": ticker, **distress}


@app.get("/coverage")
def get_coverage():
    path = ANALYTICS_BASE / "summary" / "coverage.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Coverage not found")
    import json
    return json.loads(path.read_text())


@app.get("/movers")
def get_movers():
    path = ANALYTICS_BASE / "summary" / "movers_zscores.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Movers not found")
    import json
    return json.loads(path.read_text())
