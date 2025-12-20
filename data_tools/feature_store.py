"""
Refinitiv Feature Store utilities.

Goals:
1) Provide a minimal, repeatable way to organize the Refinitiv dump into
   parquet + metadata for reuse.
2) Offer helper functions to load panels, supply-chain graphs, and compute
   basic factors (skew/term-structure/liquidity flags).

This is designed to run in MOCK/OFFLINE mode—no API calls required.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd
import numpy as np

try:
    import networkx as nx
except ImportError:  # pragma: no cover - optional
    nx = None

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = BASE_DIR / "From-refinitiv"
DEFAULT_OUT = BASE_DIR / "data_lake" / "feature_store"

# New tidy panel filename defaults
TIDY_PANEL = DEFAULT_SOURCE / "3_Market_Panel_Data (1).csv"
TICKER_METADATA = DEFAULT_SOURCE / "1_Ticker_Metadata (1).csv"
SUPPLY_EDGES = DEFAULT_SOURCE / "2_Supply_Chain_Edges (1).csv"
SUPPLY_EDGES_PROXY = DEFAULT_SOURCE / "2_Supply_Chain_Edges_Proxy.csv"
PANEL_COVERAGE = DEFAULT_SOURCE / "4_Coverage_Snapshot (1).csv"


@dataclass
class DatasetInfo:
    name: str
    path: str
    rows: Optional[int] = None
    cols: Optional[int] = None
    notes: Optional[str] = None


def discover_datasets(source: Path = DEFAULT_SOURCE) -> Dict[str, DatasetInfo]:
    """Locate known Refinitiv CSVs."""
    mapping = {}
    if not source.exists():
        return mapping
    for csv in source.glob("*.csv"):
        mapping[csv.name] = DatasetInfo(name=csv.stem, path=str(csv))
    return mapping


def to_parquet(csv_path: Path, out_dir: Path, compression: str = "zstd") -> Path:
    """Convert a CSV to parquet with basic type inference."""
    out_dir.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(csv_path)
    parquet_path = out_dir / f"{csv_path.stem}.parquet"
    df.to_parquet(parquet_path, compression=compression)
    return parquet_path


def load_panel(csv_path: Path, parse_dates: bool = True) -> pd.DataFrame:
    """Load a panel CSV (wide format)."""
    if parse_dates:
        return pd.read_csv(
            csv_path,
            index_col=0,
            parse_dates=True,
            low_memory=False,
        )
    return pd.read_csv(csv_path, low_memory=False)


def load_tidy_panel(csv_path: Path = TIDY_PANEL) -> pd.DataFrame:
    """Load tidy panel (Instrument, Date, Price_Close, Volume, HistVol_30D)."""
    df = pd.read_csv(csv_path, parse_dates=["Date"])
    return df


def load_supply_chain_graph(csv_path: Path):
    """
    Build a graph from supply chain CSV (requires networkx).
    If only Instrument/ESG are present, returns node-only graph.
    """
    if nx is None:
        raise ImportError("networkx is required for graph loading")
    df = pd.read_csv(csv_path)
    g = nx.DiGraph()
    for _, row in df.iterrows():
        instrument = row.get("Instrument") or row.get("InstrumentTicker")
        if not instrument:
            continue
        esg = row.get("ESG Score") or row.get("TR.ESGScore") or row.get("TR.TRESGScore")
        suppliers = _split_list(row.get("TR.Supplier") or row.get("Supplier"))
        customers = _split_list(row.get("TR.Customer") or row.get("Customer"))
        g.add_node(instrument, esg=esg)
        for sup in suppliers:
            g.add_edge(sup, instrument, relation="supplier")
        for cus in customers:
            g.add_edge(instrument, cus, relation="customer")
    return g


def _split_list(value) -> List[str]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return []
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    if isinstance(value, list):
        return value
    return []


def _auto_map_columns(df: pd.DataFrame, base: str) -> Dict[str, str]:
    """
    Map generic fields to actual columns for a ticker with suffixes.
    Example pattern: AAPL.OQ, AAPL.OQ.1, ...
    Heuristic: use first N columns for price/volume/vols if they exist.
    """
    cols = [c for c in df.columns if base in c]
    mapping = {}
    if not cols:
        return mapping
    # Sort to stabilize order
    cols = sorted(cols)
    # Assign heuristics: price -> first, volume -> second, vol cols -> later
    if len(cols) >= 1:
        mapping["price"] = cols[0]
    if len(cols) >= 2:
        mapping["volume"] = cols[1]
    if len(cols) >= 3:
        mapping["put_vol"] = cols[2]
    if len(cols) >= 4:
        mapping["call_vol"] = cols[3]
    if len(cols) >= 5:
        mapping["vol30"] = cols[4]
    if len(cols) >= 6:
        mapping["vol360"] = cols[5]
    if len(cols) >= 7:
        mapping["short_interest"] = cols[6]
    return mapping


def _to_numeric_safe(series: pd.Series) -> pd.Series:
    try:
        return pd.to_numeric(series, errors="coerce")
    except Exception:
        return series


def compute_basic_factors(
    df: pd.DataFrame,
    ticker_hint: Optional[str] = None,
    price_col: str = "TR.PriceClose",
    volume_col: str = "TR.Volume",
    put_col: str = "TR.ImpVolPutDelta25",
    call_col: str = "TR.ImpVolDelta25",
    vol30_col: str = "TR.Volatility30D",
    vol360_col: str = "TR.Volatility360D",
    short_col: str = "TR.ShortInterestRatio",
) -> pd.DataFrame:
    """
    Compute lightweight signals on a per-column basis.
    Tries auto-mapping if canonical columns are missing.
    """
    # Auto-map for suffix-style columns
    if ticker_hint:
        mapping = _auto_map_columns(df, ticker_hint)
        price_col = mapping.get("price", price_col)
        volume_col = mapping.get("volume", volume_col)
        put_col = mapping.get("put_vol", put_col)
        call_col = mapping.get("call_vol", call_col)
        vol30_col = mapping.get("vol30", vol30_col)
        vol360_col = mapping.get("vol360", vol360_col)
        short_col = mapping.get("short_interest", short_col)

    signals = pd.DataFrame(index=df.index)
    if put_col in df.columns and call_col in df.columns:
        p = _to_numeric_safe(df[put_col])
        c = _to_numeric_safe(df[call_col])
        signals["skew_put_minus_call"] = p - c
    if vol30_col in df.columns and vol360_col in df.columns:
        v30 = _to_numeric_safe(df[vol30_col])
        v360 = _to_numeric_safe(df[vol360_col])
        signals["term_structure_inversion"] = v30 - v360
    if volume_col in df.columns:
        v = _to_numeric_safe(df[volume_col])
        signals["liquidity_flag"] = v.rolling(5).mean()
    if short_col in df.columns:
        signals["short_interest"] = _to_numeric_safe(df[short_col])
    if price_col in df.columns:
        p = _to_numeric_safe(df[price_col])
        signals["returns_5d"] = p.pct_change(5, fill_method=None)
        signals["drawdown"] = p / p.cummax() - 1.0
    return signals


def compute_basic_factors_tidy(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute factors on tidy panel with columns:
    Instrument, Date, Price_Close, Volume, HistVol_30D (optional).
    """
    df = df.sort_values("Date").set_index("Date")
    signals = pd.DataFrame(index=df.index)
    if "HistVol_30D" in df.columns:
        signals["hist_vol_30d"] = pd.to_numeric(df["HistVol_30D"], errors="coerce")
    if "Volume" in df.columns:
        v = pd.to_numeric(df["Volume"], errors="coerce")
        signals["liquidity_flag"] = v.rolling(5).mean()
    if "Price_Close" in df.columns:
        p = pd.to_numeric(df["Price_Close"], errors="coerce")
        signals["returns_5d"] = p.pct_change(5, fill_method=None)
        signals["drawdown"] = p / p.cummax() - 1.0
        ret = p.pct_change()
        signals["realized_vol_20"] = ret.rolling(20).std() * np.sqrt(252)
    return signals


def label_distress(
    df: pd.DataFrame,
    price_col: str = "TR.PriceClose",
    gap_days: int = 60,
) -> pd.Series:
    """
    Heuristic distress label: if price history stops gap_days before the end, mark distressed.
    Works for wide panels; expects a single price column.
    """
    if price_col not in df.columns:
        return pd.Series(dtype=float)
    last_ts = df[price_col].last_valid_index()
    if last_ts is None:
        return pd.Series(dtype=float)
    end_ts = df.index.max()
    distressed = (end_ts - last_ts).days > gap_days
    return pd.Series([1.0 if distressed else 0.0], index=[price_col])


def write_metadata(datasets: Dict[str, DatasetInfo], out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({k: asdict(v) for k, v in datasets.items()}, f, indent=2)


def build_feature_store(
    source_dir: Path = DEFAULT_SOURCE,
    out_dir: Path = DEFAULT_OUT,
    convert_parquet: bool = True,
    graph_to_graphml: bool = True,
) -> Dict[str, DatasetInfo]:
    datasets = discover_datasets(source_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for name, info in datasets.items():
        path = Path(info.path)
        if convert_parquet:
            parquet_path = to_parquet(path, out_dir)
            info.notes = f"parquet: {parquet_path.name}"
        try:
            df_head = pd.read_csv(path, nrows=5)
            info.rows = len(df_head)
            info.cols = len(df_head.columns)
        except Exception:
            info.rows = None
            info.cols = None

        if graph_to_graphml and "SupplyChain" in name and nx is not None:
            g = load_supply_chain_graph(path)
            graphml_path = out_dir / f"{path.stem}.graphml"
            nx.write_graphml(g, graphml_path)
            info.notes = (info.notes or "") + f" | graphml: {graphml_path.name}"

    metadata_path = out_dir / "metadata.json"
    write_metadata(datasets, metadata_path)
    return datasets


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Build Refinitiv feature store (parquet + metadata).")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Source directory with Refinitiv CSVs.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output directory for parquet/metadata.")
    parser.add_argument("--no-parquet", action="store_true", help="Skip parquet conversion.")
    parser.add_argument("--no-graph", action="store_true", help="Skip graphml export.")
    args = parser.parse_args()

    datasets = build_feature_store(
        source_dir=args.source,
        out_dir=args.out,
        convert_parquet=not args.no_parquet,
        graph_to_graphml=not args.no_graph,
    )

    print(f"✅ Processed {len(datasets)} datasets.")
    for name, info in datasets.items():
        print(f" - {name}: rows(head)={info.rows}, cols={info.cols}, notes={info.notes}")
    print(f"Metadata written to: {args.out / 'metadata.json'}")


if __name__ == "__main__":
    main()
