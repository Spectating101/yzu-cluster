#!/usr/bin/env bash
set -euo pipefail

# Updates Cite-Agent topics via the local Cite-Agent API server (:8001),
# then writes snapshots into Sharpe-Renaissance/data_lake/research_context.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

TOPICS=(
  "ML_Return_Predictability"
  "Algo_Trading_Market_Efficiency"
  "News_Sentiment_Event_Alpha"
)

for t in "${TOPICS[@]}"; do
  echo "Updating ${t}..."
  curl -fsS -X POST "http://127.0.0.1:8001/api/v1/topics/${t}/update" >/dev/null
done

python3 "${ROOT}/Sharpe-Renaissance/scripts/refresh_cite_agent_context.py" \
  --cite-agent-url http://127.0.0.1:8001 \
  --out-dir "${ROOT}/Sharpe-Renaissance/data_lake/research_context" \
  --topics "${TOPICS[@]}"

echo "Done. Snapshots in ${ROOT}/Sharpe-Renaissance/data_lake/research_context/"

