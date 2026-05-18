#!/usr/bin/env python3
"""
Crypto Data Analysis Starter
==============================
A ready-to-run script for exploring the professor_crypto_panel.csv dataset.

Requirements:  pip install pandas matplotlib seaborn

How to use:
  1. Make sure professor_crypto_panel.csv is in the same folder as this script.
  2. Run:  python analysis_starter.py
  3. It will ask which coins you want to analyse.
  4. Charts are saved as PNG files in the same folder.
"""

from pathlib import Path

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

# ── locate panel ──────────────────────────────────────────────────────────────

PANEL_CSV = Path(__file__).parent / "professor_crypto_panel.csv"
if not PANEL_CSV.exists():
    PANEL_CSV = Path(__file__).parent / "output" / "professor_crypto_panel.csv"

# ── load ──────────────────────────────────────────────────────────────────────

print("Loading panel...")
df = pd.read_csv(PANEL_CSV)
df["date"] = pd.to_datetime(df["date"])

print(f"  {len(df):,} rows  |  {df['id'].nunique()} coins  |  "
      f"{df['date'].min().date()} to {df['date'].max().date()}")

# ── coin selection ────────────────────────────────────────────────────────────

# Build lookup: name -> id  and  symbol -> id  (case-insensitive)
id_lookup: dict[str, str] = {}
for _, row in df[["id","name"]].drop_duplicates().iterrows():
    id_lookup[str(row["name"]).lower()] = row["id"]
    id_lookup[row["id"].lower()]         = row["id"]

# Also load symbol map from COIN_INDEX if available
index_path = Path(__file__).parent / "per_coin" / "COIN_INDEX.csv"
if index_path.exists():
    idx = pd.read_csv(index_path)
    for _, row in idx.iterrows():
        if pd.notna(row.get("symbol")):
            id_lookup[str(row["symbol"]).lower()] = row["coingecko_id"]

def resolve_coin(query: str) -> str | None:
    """Resolve a name, symbol, or coingecko id to the canonical coingecko id."""
    return id_lookup.get(query.strip().lower())

DEFAULT_COINS = ["bitcoin", "ethereum", "solana", "ripple", "litecoin"]

print()
print("Which coins do you want to analyse?")
print("  Enter coin names, symbols, or IDs separated by commas.")
print(f"  Press Enter to use the default: Bitcoin, Ethereum, Solana, XRP, Litecoin")
print()
raw = input("Coins: ").strip()

if not raw:
    FOCUS_COINS = DEFAULT_COINS
else:
    FOCUS_COINS = []
    for entry in raw.split(","):
        resolved = resolve_coin(entry)
        if resolved:
            FOCUS_COINS.append(resolved)
        else:
            print(f"  Warning: '{entry.strip()}' not found — skipping. Check COIN_INDEX.csv for valid names.")

if not FOCUS_COINS:
    print("No valid coins found, using defaults.")
    FOCUS_COINS = DEFAULT_COINS

names_display = [df[df["id"]==c]["name"].iloc[0] if c in df["id"].values else c for c in FOCUS_COINS]
print(f"\nAnalysing: {', '.join(names_display)}\n")

# ── helper ────────────────────────────────────────────────────────────────────

def get_coin(coin_id: str) -> pd.DataFrame:
    """Return all rows for one coin, sorted by date."""
    return df[df["id"] == coin_id].sort_values("date").copy()

# ── 1.  Price history for focus coins  ───────────────────────────────────────

print("\n[1] Plotting price history...")

fig, axes = plt.subplots(len(FOCUS_COINS), 1,
                         figsize=(14, 3 * len(FOCUS_COINS)),
                         sharex=True)
if len(FOCUS_COINS) == 1:
    axes = [axes]

for ax, coin_id in zip(axes, FOCUS_COINS):
    c = get_coin(coin_id)
    if c.empty:
        ax.set_title(f"{coin_id}  (no data)")
        continue
    name = c["name"].iloc[0]
    ax.plot(c["date"], c["current_price"], linewidth=1.2, color="steelblue")
    ax.set_title(f"{name}  ({coin_id})", fontsize=10, loc="left")
    ax.set_ylabel("USD", fontsize=8)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"${x:,.0f}"))
    ax.grid(axis="y", alpha=0.3)

axes[-1].xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
fig.autofmt_xdate()
fig.suptitle("Daily Close Price (USD)", fontsize=13, y=1.01)
fig.tight_layout()
out1 = Path(__file__).parent / "price_history.png"
fig.savefig(out1, bbox_inches="tight", dpi=150)
print(f"  Saved: {out1}")
plt.close(fig)

# ── 2.  Normalised returns (all focus coins on one chart)  ────────────────────

print("\n[2] Plotting normalised returns (rebased to 100)...")

fig, ax = plt.subplots(figsize=(14, 5))
colors = plt.cm.tab10.colors

for idx, coin_id in enumerate(FOCUS_COINS):
    c = get_coin(coin_id)
    if c.empty or c["current_price"].dropna().empty:
        continue
    c = c.dropna(subset=["current_price"])
    first = c["current_price"].iloc[0]
    rebased = c["current_price"] / first * 100
    name = c["name"].iloc[0]
    ax.plot(c["date"], rebased, label=name, linewidth=1.5,
            color=colors[idx % len(colors)])

ax.axhline(100, color="black", linewidth=0.8, linestyle="--", alpha=0.5)
ax.set_title("Normalised Price (rebased to 100 at first data point)")
ax.set_ylabel("Index (100 = start)")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
fig.autofmt_xdate()
ax.legend(loc="upper left", fontsize=9)
ax.grid(alpha=0.3)
fig.tight_layout()
out2 = Path(__file__).parent / "normalised_returns.png"
fig.savefig(out2, bbox_inches="tight", dpi=150)
print(f"  Saved: {out2}")
plt.close(fig)

# ── 3.  Rolling 30-day volatility  ───────────────────────────────────────────

print("\n[3] Plotting 30-day rolling volatility (annualised)...")

fig, ax = plt.subplots(figsize=(14, 5))

for idx, coin_id in enumerate(FOCUS_COINS):
    c = get_coin(coin_id).dropna(subset=["current_price"])
    if len(c) < 32:
        continue
    daily_ret = c["current_price"].pct_change()
    vol_ann   = daily_ret.rolling(30).std() * (365 ** 0.5) * 100  # annualised %
    name = c["name"].iloc[0]
    ax.plot(c["date"], vol_ann, label=name, linewidth=1.2,
            color=colors[idx % len(colors)])

ax.set_title("30-day Rolling Volatility (annualised %)")
ax.set_ylabel("Volatility (%)")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
fig.autofmt_xdate()
ax.legend(loc="upper right", fontsize=9)
ax.grid(alpha=0.3)
fig.tight_layout()
out3 = Path(__file__).parent / "rolling_volatility.png"
fig.savefig(out3, bbox_inches="tight", dpi=150)
print(f"  Saved: {out3}")
plt.close(fig)

# ── 4.  Correlation matrix (30-day returns)  ─────────────────────────────────

print("\n[4] Computing return correlation matrix for focus coins...")

try:
    import seaborn as sns
    has_seaborn = True
except ImportError:
    has_seaborn = False
    print("  (seaborn not installed — skipping heatmap, printing table instead)")

name_map = {row["id"]: row["name"] for _, row in
            df[df["id"].isin(FOCUS_COINS)][["id", "name"]].drop_duplicates().iterrows()}

ret_dict = {}
for coin_id in FOCUS_COINS:
    c = get_coin(coin_id).dropna(subset=["current_price"])
    if c.empty:
        continue
    label = name_map.get(coin_id, coin_id)
    ret_dict[label] = c.set_index("date")["current_price"].pct_change()

ret_df = pd.DataFrame(ret_dict)
corr   = ret_df.corr()
print(corr.round(3).to_string())

if has_seaborn:
    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm",
                center=0, vmin=-1, vmax=1, ax=ax, square=True)
    ax.set_title("Daily Return Correlation Matrix")
    fig.tight_layout()
    out4 = Path(__file__).parent / "correlation_matrix.png"
    fig.savefig(out4, bbox_inches="tight", dpi=150)
    print(f"  Saved: {out4}")
    plt.close(fig)

# ── 5.  Quick summary stats  ──────────────────────────────────────────────────

print("\n[5] Summary statistics per coin:")
print("-" * 80)

rows = []
for coin_id in FOCUS_COINS:
    c = get_coin(coin_id).dropna(subset=["current_price"])
    if c.empty:
        continue
    p = c["current_price"]
    ret = p.pct_change().dropna()
    cagr = ((p.iloc[-1] / p.iloc[0]) ** (365 / max(len(p), 1)) - 1) * 100
    sharpe = (ret.mean() / ret.std() * (365 ** 0.5)) if ret.std() > 0 else float("nan")
    rows.append({
        "Coin":        c["name"].iloc[0],
        "From":        str(c["date"].min().date()),
        "To":          str(c["date"].max().date()),
        "Days":        len(c),
        "First $":     f"{p.iloc[0]:,.2f}",
        "Last $":      f"{p.iloc[-1]:,.2f}",
        "CAGR %":      f"{cagr:.1f}",
        "Ann.Vol %":   f"{ret.std() * (365**0.5) * 100:.1f}",
        "Sharpe":      f"{sharpe:.2f}",
    })

summary = pd.DataFrame(rows)
print(summary.to_string(index=False))

# ── 6.  How to filter to a single coin (example)  ────────────────────────────

print("""
──────────────────────────────────────────────────────────────
How to use this dataset in your own analysis:

  import pandas as pd
  df = pd.read_csv("professor_crypto_panel.csv")
  df["date"] = pd.to_datetime(df["date"])

  # Filter to one coin
  btc = df[df["id"] == "bitcoin"].sort_values("date")

  # Filter to a date range
  btc_2024 = btc[(btc["date"] >= "2024-01-01") & (btc["date"] < "2025-01-01")]

  # All coins for a specific date
  snapshot = df[df["date"] == "2026-01-01"]

  # Available coins
  print(df["id"].unique())
──────────────────────────────────────────────────────────────
""")

print("Analysis complete.")
