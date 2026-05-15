'use strict';

// Unit tests for @vigil/client.
//
// We use node's built-in test runner so the package has zero
// dev-dependencies — `npm test` works on a clean install without
// pulling jest/mocha. The trade-off is slightly more verbose
// assertions; we keep them readable with a couple of small helpers.

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const { wrapDSN, wrapPg, token } = require('../index.js');

const ENV_VAR = 'VIGIL_TOKEN';

function withEnv(value, fn) {
  const prev = process.env[ENV_VAR];
  if (value === null || value === undefined) {
    delete process.env[ENV_VAR];
  } else {
    process.env[ENV_VAR] = value;
  }
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = prev;
    }
  }
}

describe('wrapDSN — URL form', () => {
  it('attaches application_name with token', () => {
    withEnv('test-token-abc', () => {
      const out = wrapDSN('postgres://app:secret@localhost:5432/mydb?sslmode=disable');
      const u = new URL(out);
      assert.equal(u.searchParams.get('application_name'), 'vigil:test-token-abc');
      assert.equal(u.searchParams.get('sslmode'), 'disable');
    });
  });

  it('preserves an existing application_name', () => {
    withEnv('my-tok', () => {
      const out = wrapDSN('postgres://h/db?application_name=my-app');
      const app = new URL(out).searchParams.get('application_name');
      assert.equal(app, 'my-app:vigil:my-tok');
    });
  });

  it('accepts the postgresql:// scheme', () => {
    withEnv('tok2', () => {
      const out = wrapDSN('postgresql://localhost/mydb');
      const app = new URL(out).searchParams.get('application_name');
      assert.equal(app, 'vigil:tok2');
    });
  });
});

describe('wrapDSN — libpq key=value form', () => {
  it('appends application_name', () => {
    withEnv('kv-token', () => {
      const out = wrapDSN('host=localhost port=5432 user=app dbname=mydb');
      assert.match(out, /application_name=vigil:kv-token/);
      assert.match(out, /host=localhost/);
      assert.match(out, /port=5432/);
    });
  });

  it('preserves an existing application_name', () => {
    withEnv('kv-token', () => {
      const out = wrapDSN('host=localhost application_name=my-svc dbname=mydb');
      assert.match(out, /application_name=my-svc:vigil:kv-token/);
    });
  });
});

describe('wrapDSN — no-op without VIGIL_TOKEN', () => {
  for (const dsn of [
    'postgres://h/db',
    'host=localhost dbname=mydb',
    '',
  ]) {
    it(`returns ${JSON.stringify(dsn)} unchanged`, () => {
      withEnv(null, () => {
        assert.equal(wrapDSN(dsn), dsn);
      });
    });
  }
});

describe('token()', () => {
  it('returns null when env is unset', () => {
    withEnv(null, () => {
      assert.equal(token(), null);
    });
  });

  it('returns the env value when set', () => {
    withEnv('my-tok', () => {
      assert.equal(token(), 'my-tok');
    });
  });
});

// wrapPg requires the pg module to exist. We can't depend on it in
// package.json (the wrapper is a zero-dep package by design), but we
// CAN simulate it by stubbing a minimal pg-like module via the
// optional `opts.pg` parameter wrapPg accepts.

function makeStubPg() {
  // Minimal pg-compatible stub: Client + Pool constructors that
  // record the config they received. Real pg has many more methods;
  // we don't exercise any of them.
  function FakeClient(config) {
    this.config = config;
  }
  function FakePool(config) {
    this.config = config;
  }
  return { Client: FakeClient, Pool: FakePool };
}

// Regex tolerant of both literal and URL-encoded `:` in DSN params.
// URL.toString() encodes `:` as `%3A` inside query values.
const VIGIL_DSN_PATTERN = /application_name=vigil(:|%3A)pg-tok/;

describe('wrapPg — monkey-patch contract', () => {
  it('patches Client so new Client(dsn) attaches identity', () => {
    withEnv('pg-tok', () => {
      const stub = makeStubPg();
      wrapPg({ pg: stub });
      const c = new stub.Client('postgres://h/db');
      assert.match(c.config, VIGIL_DSN_PATTERN);
    });
  });

  it('patches Pool so new Pool({connectionString}) attaches identity', () => {
    withEnv('pg-tok', () => {
      const stub = makeStubPg();
      wrapPg({ pg: stub });
      const p = new stub.Pool({ connectionString: 'postgres://h/db' });
      assert.match(p.config.connectionString, VIGIL_DSN_PATTERN);
    });
  });

  it('handles pg config-object form', () => {
    withEnv('cfg-tok', () => {
      const stub = makeStubPg();
      wrapPg({ pg: stub });
      const c = new stub.Client({ host: 'localhost', database: 'mydb' });
      assert.equal(c.config.application_name, 'vigil:cfg-tok');
      assert.equal(c.config.host, 'localhost');
    });
  });

  it('preserves a user-supplied application_name on config object', () => {
    withEnv('chain-tok', () => {
      const stub = makeStubPg();
      wrapPg({ pg: stub });
      const c = new stub.Client({
        host: 'localhost',
        application_name: 'my-bot',
      });
      assert.equal(c.config.application_name, 'my-bot:vigil:chain-tok');
    });
  });

  it('is idempotent — calling twice does not nest wrappers', () => {
    withEnv('once', () => {
      const stub = makeStubPg();
      wrapPg({ pg: stub });
      wrapPg({ pg: stub });
      const c = new stub.Client('postgres://h/db');
      // Nesting would produce two `vigil` substrings. Count both
      // literal and URL-encoded forms.
      const total =
        (c.config.match(/vigil:/g) || []).length +
        (c.config.match(/vigil%3A/g) || []).length;
      assert.equal(total, 1, `unexpected count in: ${c.config}`);
    });
  });

  it('no-op without VIGIL_TOKEN — DSN unchanged', () => {
    withEnv(null, () => {
      const stub = makeStubPg();
      wrapPg({ pg: stub });
      const c = new stub.Client('postgres://h/db');
      assert.equal(c.config, 'postgres://h/db');
    });
  });

  it('safe when pg is not installed', () => {
    // No opts.pg passed; on this test machine pg isn't a dependency
    // of the helper package, so require('pg') will throw. The
    // documented contract is "silent no-op" — we just assert it
    // doesn't throw.
    withEnv('safe-tok', () => {
      assert.doesNotThrow(() => wrapPg());
    });
  });
});
