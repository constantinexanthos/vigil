# Changelog

## v0.1.0 — initial release

- `wrapDSN(dsn)` — pure function that edits a DSN string (URL or libpq key=value).
- `wrapPg()` — monkey-patches node-postgres so `new Client()` / `new Pool()` carry identity automatically.
- Both APIs are no-ops when `VIGIL_TOKEN` is not set.
- Preserves a user-supplied `application_name` via `:`-chaining.
- `token()` returns the current env value.
- TypeScript definitions ship in `index.d.ts`.
