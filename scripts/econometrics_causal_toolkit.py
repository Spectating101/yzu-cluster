#!/usr/bin/env python3
from __future__ import annotations

"""
Econometrics / Causal Inference Toolkit (MVP)

Purpose (Upwork fit):
- Difference-in-Differences (DID) regressions with optional unit/time fixed effects
- Robust / clustered standard errors
- Client-style artifacts: results.json + results.txt (+ optional cleaned input copy)

This is intentionally "batteries included" around statsmodels, with a small, explicit input schema.
"""

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import pandas as pd

try:
    import statsmodels.formula.api as smf
    from statsmodels.tools.sm_exceptions import ValueWarning
except Exception as e:  # pragma: no cover
    raise SystemExit(
        "statsmodels is required for econometrics_causal_toolkit.py.\n"
        "Install with: pip install statsmodels"
    ) from e


@dataclass(frozen=True)
class DidSpec:
    unit_col: str
    time_col: str
    y_col: str
    treated_col: str
    post_col: str


def _ensure_out_dir(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)


def _load_panel_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    return df


def _maybe_parse_date(df: pd.DataFrame, col: str) -> pd.DataFrame:
    if col in df.columns:
        df = df.copy()
        df[col] = pd.to_datetime(df[col], errors="coerce")
    return df


def _did_design(df: pd.DataFrame, spec: DidSpec) -> pd.DataFrame:
    missing = [c for c in [spec.unit_col, spec.time_col, spec.y_col, spec.treated_col, spec.post_col] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    out = df[[spec.unit_col, spec.time_col, spec.y_col, spec.treated_col, spec.post_col]].copy()
    out = out.dropna(subset=[spec.unit_col, spec.time_col, spec.y_col, spec.treated_col, spec.post_col])

    out[spec.treated_col] = out[spec.treated_col].astype(int)
    out[spec.post_col] = out[spec.post_col].astype(int)
    out["did"] = out[spec.treated_col] * out[spec.post_col]
    return out


def _fit_did(
    df: pd.DataFrame,
    spec: DidSpec,
    *,
    unit_fe: bool,
    time_fe: bool,
    cov_type: str,
    cluster_col: Optional[str],
) -> Tuple[object, str]:
    parts = [f"{spec.y_col} ~ {spec.treated_col} + {spec.post_col} + did"]
    if unit_fe:
        parts.append(f"+ C({spec.unit_col})")
    if time_fe:
        parts.append(f"+ C({spec.time_col})")
    formula = " ".join(parts)

    model = smf.ols(formula=formula, data=df)

    cov_type = (cov_type or "nonrobust").strip().lower()
    if cov_type in {"cluster", "clustered"}:
        if not cluster_col:
            raise ValueError("--cluster-col is required when --cov-type cluster")
        fitted = model.fit(cov_type="cluster", cov_kwds={"groups": df[cluster_col]})
    elif cov_type in {"hc1", "robust", "heteroskedastic"}:
        fitted = model.fit(cov_type="HC1")
    elif cov_type in {"nonrobust", "ols"}:
        fitted = model.fit()
    else:
        raise ValueError(f"Unknown cov_type: {cov_type}")

    return fitted, formula


def _summary_payload(fitted: object, *, formula: str) -> Dict[str, object]:
    # Pull the DID coefficient if present.
    params = getattr(fitted, "params", pd.Series(dtype=float))
    bse = getattr(fitted, "bse", pd.Series(dtype=float))
    pvalues = getattr(fitted, "pvalues", pd.Series(dtype=float))
    did_key = "did" if "did" in params.index else None

    out: Dict[str, object] = {
        "formula": formula,
        "nobs": int(getattr(fitted, "nobs", 0)),
        "r2": float(getattr(fitted, "rsquared", np.nan)),
        "r2_adj": float(getattr(fitted, "rsquared_adj", np.nan)),
        "params": {k: float(v) for k, v in params.items()},
        "bse": {k: float(v) for k, v in bse.items()},
        "pvalues": {k: float(v) for k, v in pvalues.items()},
    }
    if did_key:
        out["did_effect"] = {
            "coef": float(params[did_key]),
            "se": float(bse[did_key]),
            "pvalue": float(pvalues[did_key]),
        }
    return out


def _write_results(out_dir: Path, payload: Dict[str, object], fitted: object) -> None:
    (out_dir / "results.json").write_text(json.dumps(payload, indent=2))
    (out_dir / "results.txt").write_text(str(getattr(fitted, "summary")()))


def _make_demo(seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    n_units = 60
    n_periods = 24
    units = [f"firm_{i:03d}" for i in range(n_units)]
    times = pd.date_range("2022-01-01", periods=n_periods, freq="MS")

    treated_units = set(units[: n_units // 2])
    shock_start = times[n_periods // 2]
    rows = []
    for u in units:
        alpha_u = rng.normal(0.0, 1.0)
        for t in times:
            treated = int(u in treated_units)
            post = int(t >= shock_start)
            # True DID effect (treatment only after shock).
            tau = 0.7
            y = 2.0 + alpha_u + 0.1 * (t.month) + tau * treated * post + rng.normal(0.0, 1.0)
            rows.append(
                {
                    "unit": u,
                    "date": t.strftime("%Y-%m-%d"),
                    "y": y,
                    "treated": treated,
                    "post": post,
                }
            )
    return pd.DataFrame(rows)


def main() -> int:
    p = argparse.ArgumentParser(description="Econometrics / causal inference toolkit (DID MVP).")
    sub = p.add_subparsers(dest="cmd", required=True)

    did = sub.add_parser("did", help="Run DID regression.")
    did.add_argument("--in", dest="in_path", type=Path, help="Input CSV with panel rows.")
    did.add_argument("--out-dir", type=Path, required=True)
    did.add_argument("--demo", action="store_true", help="Ignore --in and use a synthetic dataset.")
    did.add_argument("--seed", type=int, default=7)

    did.add_argument("--unit-col", type=str, default="unit")
    did.add_argument("--time-col", type=str, default="date")
    did.add_argument("--y-col", type=str, default="y")
    did.add_argument("--treated-col", type=str, default="treated")
    did.add_argument("--post-col", type=str, default="post")

    did.add_argument("--unit-fe", action="store_true", help="Add unit fixed effects.")
    did.add_argument("--time-fe", action="store_true", help="Add time fixed effects.")
    did.add_argument(
        "--cov-type",
        type=str,
        default="cluster",
        choices=["cluster", "hc1", "nonrobust"],
        help="Standard error type.",
    )
    did.add_argument(
        "--cluster-col",
        type=str,
        default="unit",
        help="Column used for clustering if --cov-type cluster.",
    )

    args = p.parse_args()

    if args.cmd == "did":
        _ensure_out_dir(args.out_dir)
        # Statsmodels can emit a benign warning when running FE-heavy specs with clustered SEs.
        import warnings

        warnings.filterwarnings("ignore", category=ValueWarning)

        if args.demo:
            df = _make_demo(seed=int(args.seed))
            (args.out_dir / "input_demo.csv").write_text(df.to_csv(index=False))
        else:
            if not args.in_path:
                raise SystemExit("--in is required unless --demo is set")
            df = _load_panel_csv(args.in_path)

        df = _maybe_parse_date(df, args.time_col)

        spec = DidSpec(
            unit_col=args.unit_col,
            time_col=args.time_col,
            y_col=args.y_col,
            treated_col=args.treated_col,
            post_col=args.post_col,
        )
        design = _did_design(df, spec)

        fitted, formula = _fit_did(
            design,
            spec,
            unit_fe=bool(args.unit_fe),
            time_fe=bool(args.time_fe),
            cov_type=str(args.cov_type),
            cluster_col=str(args.cluster_col) if args.cov_type == "cluster" else None,
        )

        payload = _summary_payload(fitted, formula=formula)
        payload["notes"] = {
            "interpretation": "The DID effect is the coefficient on `did = treated * post`.",
            "warning": "Causal validity depends on identification assumptions (parallel trends, etc).",
        }
        _write_results(args.out_dir, payload, fitted)
        print(json.dumps(payload.get("did_effect", {}), indent=2))
        return 0

    raise SystemExit(f"Unknown command: {args.cmd}")


if __name__ == "__main__":
    raise SystemExit(main())
