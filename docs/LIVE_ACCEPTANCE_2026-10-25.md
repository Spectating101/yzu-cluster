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

## Backend defects (for Codex)

1. **Assistant quota exhausted.** Both Ask and the coverage check fail on the provider's monthly quota. The desk's own allowance still reads 60/60, so the two limits disagree. Needs capacity or a provider decision (owner ruled out Azure for the coverage check on 2026-10-23).
2. **Collected CSV columns are misaligned.** `https://raw.githubusercontent.com/datasets/co2-ppm/main/data/co2-mm-mlo.csv` registered with headers `Date, Decimal Date, Average, Interpolated, Trend, Number of Days, column_7`, but the values are shifted ("Trend" holds `-01`, an extra `column_7`). The header has one fewer name than the data columns; the collector stored it as-is. Same class as the 2026-10-22 parity benchmark (no transform or validation after fetch).
3. **`recommended_use` holds an internal path** for collected datasets: `Inspect files under data_lake/procured/…/table_1.parquet`. The UI now hides it; the field should carry research guidance or be empty.
4. **No `source_system` on collected datasets**, only `source_url`. The UI now derives "GitHub · datasets/co2-ppm" from the URL; a source name at registration would be better.
5. **Evidence-map nodes for collected datasets use the request title** ("Custom collect · raw.githubusercontent.com") instead of the dataset name, and their `coverage` is a Python dict string (`{'rows': 822, 'columns': [...], 'date_range': {...}}`). The picker now maps both; the build page's join decision still shows the request title.
6. **Request plans for URL collections have no `provider`/`source_id`**; the review dialog now falls back to the URL host.

## Frontend fixes made from this run

- "Waiting for your approval" → "Waiting for approval" everywhere (members cannot approve).
- Source falls back to the URL (`sourceFromUrl`), in the Library row and the request dialog.
- "Use it for" hides storage paths.
- Ask shows a plain message for provider quota and composer failures (`askFailure.js`) instead of the raw error with a request ID.
- The Synthesis input picker shows the Library name and a plain period instead of the request title and dict text.

## Re-run

Repeat after the backend fixes: coverage check on "Which datasets give monthly inflation by country since 2000?", one Ask question, one URL collection of a small CSV with a header/value mismatch, and the Synthesis build through method approval and run.
