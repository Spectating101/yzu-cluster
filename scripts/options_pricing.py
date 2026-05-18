#!/usr/bin/env python3
"""
Minimal option pricing utilities (research use).

Includes a Cox-Ross-Rubinstein (CRR) binomial tree pricer for European options.
This is not production pricing code.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class OptionSpec:
    spot: float
    strike: float
    t_years: float
    rate: float
    vol: float
    is_call: bool


def crr_european_price(spec: OptionSpec, *, steps: int = 200) -> float:
    s0 = float(spec.spot)
    k = float(spec.strike)
    t = float(spec.t_years)
    r = float(spec.rate)
    sig = float(spec.vol)
    is_call = bool(spec.is_call)
    steps = int(max(1, steps))

    if s0 <= 0 or k <= 0 or t <= 0 or sig <= 0:
        # Immediate expiry / degenerate; return intrinsic.
        intrinsic = max(0.0, s0 - k) if is_call else max(0.0, k - s0)
        return float(intrinsic)

    dt = t / steps
    u = math.exp(sig * math.sqrt(dt))
    d = 1.0 / u
    disc = math.exp(-r * dt)
    p = (math.exp(r * dt) - d) / (u - d)
    p = min(1.0, max(0.0, p))

    # Terminal payoffs.
    values = []
    for j in range(steps + 1):
        s_t = s0 * (u ** j) * (d ** (steps - j))
        payoff = max(0.0, s_t - k) if is_call else max(0.0, k - s_t)
        values.append(payoff)

    # Backward induction.
    for _ in range(steps):
        values = [disc * (p * values[i + 1] + (1.0 - p) * values[i]) for i in range(len(values) - 1)]
    return float(values[0])


def black_scholes_price(spec: OptionSpec) -> float:
    # For sanity checks / approximate pricing.
    s0 = float(spec.spot)
    k = float(spec.strike)
    t = float(spec.t_years)
    r = float(spec.rate)
    sig = float(spec.vol)
    is_call = bool(spec.is_call)
    if s0 <= 0 or k <= 0 or t <= 0 or sig <= 0:
        intrinsic = max(0.0, s0 - k) if is_call else max(0.0, k - s0)
        return float(intrinsic)

    d1 = (math.log(s0 / k) + (r + 0.5 * sig * sig) * t) / (sig * math.sqrt(t))
    d2 = d1 - sig * math.sqrt(t)

    def n(x: float) -> float:
        return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

    if is_call:
        return float(s0 * n(d1) - k * math.exp(-r * t) * n(d2))
    return float(k * math.exp(-r * t) * n(-d2) - s0 * n(-d1))

