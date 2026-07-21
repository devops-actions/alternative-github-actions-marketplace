---
applyTo: "src/frontend/src/services/actionsService.ts"
---

# Dependents / "used by" count parsing

The `dependents` value coming from the API can be a **comma-formatted
string** (e.g. `"15,356,161"`) or end with a `+` (e.g. `"999+"`). It
originates from a regex-scrape of GitHub's `/network/dependents` page and is
passed through unchanged by the backend and Azure Table Storage.

`parseDependentsCount` / `formatDependentsCount` MUST strip thousands
separators (commas) before calling `parseInt`/`Number`, otherwise the value
silently truncates at the first comma (e.g. `parseInt("16,842,392", 10)` ===
`16`). This was the root cause of the marketplace showing tiny "used by"
numbers (e.g. `16`) for very popular actions like `actions/checkout`.

Full investigation/debugging runbook for this class of bug lives in the
sibling `actions-marketplace-checks` repo:
`actions-marketplace-checks/DEPENDENTS-COUNT-DEBUGGING.md`.
