# Sharpe-Renaissance: The Unified Financial Intelligence Platform

## 🌟 Overview
**Sharpe-Renaissance** is the consolidated successor to the `Sharpe`, `Finsight`, and `Nocturnal` projects. It integrates high-performance trading logic, production-grade data harvesting, and autonomous agent swarms into a single, cohesive engine.

## 🏗️ Architecture: The "Data Refinery"

The system operates as a pipeline: **Harvest -> Process -> Analyze -> Act**.

### 1. `api/` (The Harvester)
*   **Source:** `finsight-api` (Production Src)
*   **Role:** Connects to Refinitiv/SEC. Extracts raw "Ore" (XBRL tags, Price History).
*   **Key Tech:** FastAPI, Stripe.

### 2. `high_perf/` (The Smelter)
*   **Source:** `Sharpe-IDX-Engine/rust`
*   **Role:** High-speed data processing. Calculates complex indicators, liquidity metrics, and portfolio optimization math in Rust.
*   **Key Tech:** Rust, PyO3.

### 3. `trading/` (The Factory)
*   **Source:** `Sharpe-IDX-Engine/src` + `Sharpe-Expanded` Math
*   **Role:** Backtesting Engine & R&D Lab.
*   **Components:**
    *   `core/`: Bayesian Inference, Causal Analysis (PhD Logic).
    *   `backtesting/`: Event-driven simulation.
    *   `data/`: Unified Data Loader (`parquet` -> `pandas`).
*   **Key Tech:** Python, Statsmodels, PyMC.

### 4. `engine/` (The Analyst)
*   **Source:** `Sharpe-Expanded/engine`
*   **Role:** The "Brain". Uses Cerebras LLM to read the Signals and write human-readable Investment Memos.

### 5. `agents/` (The Swarm)
*   **Source:** `finsight-api/finrobot-coursework`
*   **Role:** **Multi-Agent System.** Autonomous agents that can perform specific research tasks (e.g., "Find all competitors to NVDA and compare R&D spend").

### 6. `web/` (The Dashboard)
*   **Source:** `Nocturnal-Finsight`
*   **Role:** The visual interface for humans to monitor the machine.

## 🔄 The Research-to-Production Workflow

1.  **Harvest (Data Pipeline):**
    *   Scripts in `api/` run (scheduled or manually).
    *   Data is saved to `data_lake/` as Parquet files (Google Drive/Local).

2.  **Research (R&D):**
    *   Quant runs experiments in `trading/analysis` (using `factor_zoo.py`).
    *   Hypothesis: "Does Factor X predict returns?"
    *   Validation: `trading/core/causal_inference.py` confirms causality.

3.  **Production (Engine):**
    *   `main.py` runs the daily cycle.
    *   It uses `high_perf` (Rust) to compute the validated factors instantly.
    *   It uses `trading/core` (Bayesian) to estimate regime probabilities.
    *   It uses `engine/` (LLM) to write the daily report.

## 🚀 Getting Started

### Prerequisites
*   Python 3.11+
*   Rust (Cargo)
*   Node.js 18+

### Build the Rust Engine
```bash
cd high_perf
maturin develop --release
```

### Run the Data API
```bash
cd api
uvicorn main:app --reload
```

### Quick Dev/Smoke (Mock Mode)
```bash
cd Sharpe-Renaissance
make install           # pip install -e .
make build-rust        # build PyO3 extension (optional in mock mode)
make smoke             # runs scripts/smoke_mock_cycle.py with MODE=mock

# or run directly
python main.py --mode mock --tickers AAPL MSFT
```

### Refinitiv Feature Store (Data Drop → Parquet/Metadata)
```bash
# Convert Refinitiv CSVs in From-refinitiv/ to parquet + metadata
python scripts/refinitiv_feature_store.py --source From-refinitiv --out data_lake/feature_store

# Skip conversions (metadata only)
python scripts/refinitiv_feature_store.py --no-parquet --no-graph
```

### Refinitiv Analytics API (serves factors/distress/coverage)
```bash
# Make sure analytics pack exists (run analytics_pack.py first)
uvicorn scripts.refinitiv_api:app --reload
# Endpoints:
#   GET /tickers
#   GET /factors/{ticker}
#   GET /distress/{ticker}
#   GET /coverage
#   GET /movers
```
