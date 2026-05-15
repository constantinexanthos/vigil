# Changelog

## v0.1.0 — initial release

- `WrapPgxConfig` attaches `application_name=vigil:<token>` to a pgx config.
- `WrapDSN` accepts both URL and libpq key=value forms.
- Both APIs are no-ops when `VIGIL_TOKEN` is not set.
- Preserves a user-supplied `application_name` via `:`-chaining.
- `Token()` helper exposes the current env value.
