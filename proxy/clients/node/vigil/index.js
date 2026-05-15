// @vigil/client — attach a Vigil identity token to your Postgres
// connection so vigil-proxy sees who's talking.
//
// Public API:
//
//   wrapDSN(dsn)         — pure function. Edit a DSN string in place.
//   wrapPg(opts?)        — monkey-patch node-postgres's Client + Pool.
//   token()              — return VIGIL_TOKEN or null.
//
// Both wrap_* APIs are no-ops when VIGIL_TOKEN is not set in the
// environment.

'use strict';

const ENV_VAR = 'VIGIL_TOKEN';
const APP_NAME_KEY = 'application_name';
const PATCH_MARKER = Symbol.for('vigil.patched');

function token() {
  const v = process.env[ENV_VAR];
  return v && v.length > 0 ? v : null;
}

/**
 * Return `dsn` with `application_name=vigil:<token>` appended.
 *
 * Accepts:
 *   - URL form: postgres://user:pass@host:5432/db?sslmode=disable
 *   - libpq key=value form: "host=localhost port=5432 user=app dbname=mydb"
 *
 * Returns the input unchanged when VIGIL_TOKEN is not set, or when
 * `dsn` is empty / not a string.
 *
 * If the user already set application_name, the Vigil token is
 * appended via `:`-chaining (`my-app:vigil:<token>`).
 */
function wrapDSN(dsn) {
  const tok = token();
  if (!tok || typeof dsn !== 'string' || dsn.length === 0) {
    return dsn;
  }
  if (dsn.startsWith('postgres://') || dsn.startsWith('postgresql://')) {
    return wrapURLDSN(dsn, tok);
  }
  return wrapKeyValueDSN(dsn, tok);
}

function wrapURLDSN(dsn, tok) {
  let url;
  try {
    url = new URL(dsn);
  } catch (_e) {
    // Malformed DSN — return as-is rather than guess; downstream pg
    // client will surface a clearer error.
    return dsn;
  }
  const existing = url.searchParams.get(APP_NAME_KEY);
  const fresh = existing ? `${existing}:vigil:${tok}` : `vigil:${tok}`;
  url.searchParams.set(APP_NAME_KEY, fresh);
  return url.toString();
}

function wrapKeyValueDSN(dsn, tok) {
  const parts = dsn.trim().split(/\s+/);
  let replaced = false;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(APP_NAME_KEY + '=')) {
      const existing = parts[i].slice(APP_NAME_KEY.length + 1);
      parts[i] = `${APP_NAME_KEY}=${existing}:vigil:${tok}`;
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    parts.push(`${APP_NAME_KEY}=vigil:${tok}`);
  }
  return parts.join(' ');
}

/**
 * Monkey-patch node-postgres so any subsequent `new Client(...)` or
 * `new Pool(...)` call carries a Vigil identity automatically.
 *
 * Usage:
 *
 *   const { wrapPg } = require('@vigil/client');
 *   wrapPg();                   // call once at startup
 *
 *   const { Client } = require('pg');
 *   const c = new Client(process.env.DATABASE_URL);
 *   await c.connect();          // application_name=vigil:<token> attached
 *
 * The patch is idempotent. If the `pg` module isn't installed, this
 * is a no-op (a wrapper for users who haven't pulled pg in directly).
 *
 * @param {object} [opts]
 * @param {object} [opts.pg]  pre-imported pg module (mostly for tests).
 */
function wrapPg(opts) {
  let pg;
  if (opts && opts.pg) {
    pg = opts.pg;
  } else {
    try {
      pg = require('pg');
    } catch (_e) {
      return; // pg not installed — silent no-op, matches prior contract.
    }
  }
  patchPgClient(pg);
  if (pg.Pool) {
    patchPgPool(pg);
  }
}

function patchPgClient(pg) {
  if (!pg.Client || pg.Client[PATCH_MARKER]) {
    return;
  }
  const Original = pg.Client;

  function PatchedClient(config) {
    return new Original(applyIdentityToConfig(config));
  }
  PatchedClient.prototype = Original.prototype;
  PatchedClient[PATCH_MARKER] = true;
  // Preserve metadata that user code may read off of pg.Client.
  Object.defineProperty(PatchedClient, 'name', { value: 'Client' });

  pg.Client = PatchedClient;
}

function patchPgPool(pg) {
  if (!pg.Pool || pg.Pool[PATCH_MARKER]) {
    return;
  }
  const Original = pg.Pool;

  function PatchedPool(config) {
    return new Original(applyIdentityToConfig(config));
  }
  PatchedPool.prototype = Original.prototype;
  PatchedPool[PATCH_MARKER] = true;
  Object.defineProperty(PatchedPool, 'name', { value: 'Pool' });

  pg.Pool = PatchedPool;
}

// applyIdentityToConfig normalizes the half-dozen ways pg accepts
// connection configuration. Returns a (possibly new) value with
// `application_name` populated. No-ops when VIGIL_TOKEN is unset.
function applyIdentityToConfig(config) {
  const tok = token();
  if (!tok) {
    return config;
  }
  // String DSN.
  if (typeof config === 'string') {
    return wrapDSN(config);
  }
  // Falsy/undefined → empty config; pg reads env vars itself.
  if (!config) {
    return { application_name: `vigil:${tok}` };
  }
  // Config object.
  const out = { ...config };
  if (typeof out.connectionString === 'string') {
    out.connectionString = wrapDSN(out.connectionString);
  } else {
    const existing = out[APP_NAME_KEY] || '';
    out[APP_NAME_KEY] = existing ? `${existing}:vigil:${tok}` : `vigil:${tok}`;
  }
  return out;
}

module.exports = { wrapDSN, wrapPg, token };
