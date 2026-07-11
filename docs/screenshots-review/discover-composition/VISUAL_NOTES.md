# Discover Composition — visual notes

## Modes

| Mode | Shell | Main canvas |
|---|---|---|
| Browse (no selection) | `no-rail` — full width | Grouped source index |
| Focused Evaluation | `no-rail` unless Ask open | Evaluation workspace |
| Focused + Ask | rail visible for Ask only | Evaluation remains in main |

## Browse structure

1. Discover header / search
2. Process overview counts (explanatory)
3. “What data do you need?”
4. Filters
5. Groups from D1 taxonomy:
   - **In your lab**
   - **External candidates**
   - **Needs access**

No empty Detail rail reserved beside the list.

## Focused Evaluation structure

1. `← Back to results` · Ask
2. Selected identity
3. Can I use this? (+ Collection status when lifecycle exists)
4. Useful for / Coverage
5. Verified · Still unknown (side-by-side when wide)
6. Inferred / Technical evidence
7. Primary + secondary actions

Preserves D0 identity, D1 taxonomy, Evaluation evidence, lifecycle authority, Resources deep-link, Ask context.

## Screenshots

### 01 — browse awaiting
Empty Discover with full canvas; no inspector column.

### 02 — browse grouped
Search results organised by lab / external / needs-access groups.

### 03 — focus entry
Selecting a candidate replaces the list with Focused Evaluation.

### 04 — focus probed
Verified evidence in the wide workspace (not a narrow rail).

### 05 — focus with Ask
Ask opens as supporting rail; evaluation stays primary.

### 06 — back to browse
Back restores the grouped result index and search state.

### 07 — focus workspace wide
Decision hierarchy uses main content width.

### 08–11 — tablet / mobile
Same Browse → Focus transition; not final responsive polish.

## Scope

- Sufficiency / Equivalence **not** started
- Final Responsive **not** started
- Lifecycle / Evaluation semantics unchanged
