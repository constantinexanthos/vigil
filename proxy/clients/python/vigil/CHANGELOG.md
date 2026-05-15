# Changelog

## v0.1.0 — initial release

- `wrap_dsn(dsn)` — pure-function helper that edits a DSN string (URL or libpq key=value).
- `wrap_psycopg()` — monkey-patches psycopg2 and psycopg3 to inject identity on every connect.
- Both APIs are no-ops when `VIGIL_TOKEN` is not set.
- Preserves a user-supplied `application_name` via `:`-chaining.
- `token()` helper exposes the current env value.
