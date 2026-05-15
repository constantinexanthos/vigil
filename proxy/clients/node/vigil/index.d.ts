/**
 * Vigil identity helper for node-postgres and bare DSN editing.
 */

/**
 * Returns the current VIGIL_TOKEN environment value, or null if unset.
 */
export function token(): string | null;

/**
 * Returns `dsn` with `application_name=vigil:<token>` set.
 *
 * Accepts URL-form (`postgres://...`) and libpq key=value DSNs.
 * Returns the input unchanged when VIGIL_TOKEN is not set.
 * Preserves any user-supplied application_name via `:`-chaining.
 */
export function wrapDSN(dsn: string): string;

/**
 * Options for wrapPg().
 */
export interface WrapPgOptions {
  /** Pre-imported pg module — primarily for tests. */
  pg?: unknown;
}

/**
 * Monkey-patch node-postgres so any new Client / Pool gets a Vigil
 * identity automatically. Idempotent. No-op when `pg` isn't installed.
 */
export function wrapPg(opts?: WrapPgOptions): void;
