# Live acceptance on 8775 — 2026-10-25

Desk: candidate-memory-next (8775), backend `bb4abb7d`, UI `49cd0ced` and later. Driven through the real interface as the pilot member; the collection was approved with the operator account. Records created: one collection request and its dataset (`craft_raw_githubuserconten_2eb2f7cf1f`, "Mauna Loa Monthly CO₂ Concentrations"), one Synthesis build ("Monthly Mauna Loa CO2 concentrations since 1958…") with two mapped inputs. Nothing was deleted.

## Results

| Path | Result |
|---|---|
| Coverage check (Discover question) | Fails in ~17 s: "Couldn't check". Same cause as Ask. |
| Ask (Library question) | Fails: `Session error: You have exceeded your monthly quota` from the Copilot provider. |
| URL → request → operator approval → collection → Library | **Works.** query_ready about one minute after approval; archive and registry verified; preview and CSV download work. |
| Synthesis: create build → find held inputs → map → measure | **Works without the assistant.** 2 inputs mapped, 11 columns profiled, join measured (0 overlap: month vs instrument × day). |
| Synthesis: method → run → output | Blocked: method reasoning needs the assistant (quota). |

## Re-run with a rotated account (same day)

All four student Copilot accounts are past their monthly premium allowance (`-1 / 200`, reset 2026-11-01); `LY_Copilot` is rejected (401). The free-tier account Gmelody99 has no premium requests but 200 chats a month, and the `auto` model runs on them. `copilot-rotate` now accepts chat-only accounts when `COPILOT_ALLOW_CHAT_QUOTA=1` (default behaviour unchanged); 8775 runs with that flag and `DESK_COPILOT_ACCOUNTS=Gmelody99,Spectating101,spectator-26`.

| Path | Result |
|---|---|
| Ask | **Works.** 40 s; correct answer (CRSP daily file and the daily market cross-section). |
| Coverage check | **Works.** 15 s; "Likely not covered" for monthly inflation by country, IMF DataMapper offered as a source. |
| Synthesis: discuss → proposal | **Works.** The assistant found the month vs instrument × day grain mismatch, the 26,243 duplicate right-side rows, and the CO₂ file's bad ancillary columns, and asked BTC-only vs ten-coin volatility. |
| Synthesis: accepted method → run | **Blocked by the engine.** After accepting "BTC monthly volatility joined to CO₂ by month", the build returns to a join decision on the raw Date key (0 of 822 match). The engine groups only after the join (`spec_export.py`, `run_synthesis_pair`); there is no step that aggregates one input to the other's grain before joining, so the accepted method cannot become a run. |

Cost: these five assistant turns took Gmelody99 from 199 to 196 chats.

## Backend defects (for Codex)

1. **Assistant quota exhausted.** Both Ask and the coverage check fail on the provider's monthly quota. The desk's own allowance still reads 60/60, so the two limits disagree. Needs capacity or a provider decision (owner ruled out Azure for the coverage check on 2026-10-23).
2. **A malformed source CSV is stored without a warning.** The upstream file `co2-mm-mlo.csv` itself has 6 header names over 7 values, so `Trend`/`Number of Days` hold the wrong fields and a `column_7` appears. `Date` and `Average` are correct. The collector should flag a header/value count mismatch at registration rather than store it silently.
3. **`recommended_use` holds an internal path** for collected datasets: `Inspect files under data_lake/procured/…/table_1.parquet`. The UI now hides it; the field should carry research guidance or be empty.
4. **No `source_system` on collected datasets**, only `source_url`. The UI now derives "GitHub · datasets/co2-ppm" from the URL; a source name at registration would be better.
5. **Evidence-map nodes for collected datasets use the request title** ("Custom collect · raw.githubusercontent.com") instead of the dataset name, and their `coverage` is a Python dict string (`{'rows': 822, 'columns': [...], 'date_range': {...}}`). The picker now maps both; the build page's join decision still shows the request title.
6. **Synthesis cannot aggregate an input before joining** (see the re-run above). Any monthly-vs-daily study stops at the join decision.
7. **Request plans for URL collections have no `provider`/`source_id`**; the review dialog now falls back to the URL host.

## Synthesis run, end to end (2026-10-25)

Build `bc24a774d4d7452f`, recipe: BTC daily returns (`pct_change`), month via `date_trunc`, CO₂ joined with `join_asof` (backward, 31D), grouped by month → std of returns, mean CO₂, day count.

| Step | Result |
|---|---|
| Assistant writes the recipe | ❌ It tried an equi-join on a derived month; preflight refused it as `empty_join`. |
| Recipe attached via the proposal endpoint | ✅ preflight passed |
| Accept → sample preview | ✅ 121 output rows on 3,653 BTC days |
| Request approval | ✅ job `1c8324d60462` created (pending_approval) |
| Approve in the UI | ❌ no control anywhere (see below); approved through the API as operator |
| Worker build → archive → registry → Library | ✅ 20 s; archived and verified on cms-drive; registered as `synthesis_btc_vol_co2_monthly`; row ledger and as-of coverage (99.3%) recorded; `method.py` frozen |
| Correctness | ✅ independent pandas recomputation matches all 121 rows exactly |

Backend defects:
- **The join preflight measures the raw input file, not the transformed frame** (`preflight_execution_spec`, `op == "join"` → `_probe_join_step(left_path=try_path(input_row))`). Any join on a key built by an earlier rename/derive reports `empty_join`. This is what stopped the assistant.
- **`date_trunc` returns text** (`"2016-09"`), so a derived month can never equi-join a datetime `Date` column even after the probe is fixed.
- **Synthesis build jobs are tagged ops-internal** (`plan.execution_policy.scope = "ops"`, `request._ops_internal = true`), and approval needs `approve_jobs` (operator). History hides ops jobs by design, so no one can see or approve a synthesis build in the UI.
- **Output naming:** the dataset is titled "Synthesis: <truncated thread title>" rather than from the recipe's purpose.

Frontend defects (Claude):
- The method strip shows 3 of 5 steps (filter, rename, aggregate); `pct_change`, `derive` and the CO₂ `join_asof` are missing. "Rename 1 columns" is ungrammatical, and only the first metric is named.
- "Review execution approval" routes to Discover History, which cannot list the job; as operator it selected an unrelated pending collection request.
- The step is labelled "Researcher approval" but only an operator can approve.
- "Intended output: …; not yet constructed." still shows after the build is saved.

## Frontend fixes made from this run

- "Waiting for your approval" → "Waiting for approval" everywhere (members cannot approve).
- Source falls back to the URL (`sourceFromUrl`), in the Library row and the request dialog.
- "Use it for" hides storage paths.
- Ask shows a plain message for provider quota and composer failures (`askFailure.js`) instead of the raw error with a request ID.
- The Synthesis input picker shows the Library name and a plain period instead of the request title and dict text.

## Re-run

Repeat after the backend fixes: coverage check on "Which datasets give monthly inflation by country since 2000?", one Ask question, one URL collection of a small CSV with a header/value mismatch, and the Synthesis build through method approval and run.
