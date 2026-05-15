"""Implementation of wrap_dsn + wrap_psycopg.

``wrap_dsn`` is the primary, pure API — pass it a DSN string, get a DSN
string back. It's the right tool for SQLAlchemy, asyncpg, or any code
that already passes connection strings around.

``wrap_psycopg`` is the optional monkey-patch convenience: import-and-
forget. It rebinds ``psycopg2.connect`` and ``psycopg.connect`` (the
v3 module) so any subsequent connect() call automatically picks up
``VIGIL_TOKEN``. We patch both versions because psycopg2 still ships
in many production stacks; psycopg3 is what new code reaches for.

Design note: the lead's brief explicitly called out that
monkey-patching psycopg can be fragile across versions. We keep
``wrap_dsn`` available as the supported escape hatch — README points
new users at it first.
"""

from __future__ import annotations

import os
import urllib.parse
from typing import Optional

ENV_VAR = "VIGIL_TOKEN"
APP_NAME_KEY = "application_name"


def token() -> Optional[str]:
    """Return the active VIGIL_TOKEN or ``None`` if unset."""
    v = os.environ.get(ENV_VAR)
    return v if v else None


def wrap_dsn(dsn: str) -> str:
    """Return ``dsn`` with ``application_name=vigil:<token>`` set.

    Accepts both DSN forms:

    * URL: ``postgres://user:pass@host:5432/db?sslmode=disable``
    * libpq key=value: ``host=localhost port=5432 user=app dbname=mydb``

    Returns the input unchanged when ``VIGIL_TOKEN`` is not set, or
    when ``dsn`` is empty.

    If the user already set ``application_name`` (e.g. for query-log
    grouping), the Vigil token is appended via ``:``-chaining
    (``my-app:vigil:<token>``). vigil-proxy parses the first ``vigil:``
    prefix it finds, so chaining is safe.
    """
    tok = token()
    if not tok or not dsn:
        return dsn

    if dsn.startswith(("postgres://", "postgresql://")):
        return _wrap_url_dsn(dsn, tok)
    return _wrap_kv_dsn(dsn, tok)


def _wrap_url_dsn(dsn: str, tok: str) -> str:
    """Edit application_name on a URL-style DSN."""
    parsed = urllib.parse.urlparse(dsn)
    # parse_qsl preserves ordering; keep_blank_values keeps "?foo="
    # entries the user might have inserted on purpose.
    pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)

    found = False
    new_pairs = []
    for k, v in pairs:
        if k == APP_NAME_KEY:
            v = f"{v}:vigil:{tok}" if v else f"vigil:{tok}"
            found = True
        new_pairs.append((k, v))
    if not found:
        new_pairs.append((APP_NAME_KEY, f"vigil:{tok}"))

    new_query = urllib.parse.urlencode(new_pairs)
    return urllib.parse.urlunparse(parsed._replace(query=new_query))


def _wrap_kv_dsn(dsn: str, tok: str) -> str:
    """Edit application_name on a libpq key=value DSN.

    We split on whitespace and walk the tokens. If a connection-string
    user needs spaces inside a value (quoted form ``application_name='my
    app'``), they should switch to the URL form — this helper doesn't
    try to be a full DSN parser.
    """
    parts = dsn.split()
    replaced = False
    for i, p in enumerate(parts):
        if p.startswith(f"{APP_NAME_KEY}="):
            existing = p[len(APP_NAME_KEY) + 1 :]
            parts[i] = f"{APP_NAME_KEY}={existing}:vigil:{tok}"
            replaced = True
            break
    if not replaced:
        parts.append(f"{APP_NAME_KEY}=vigil:{tok}")
    return " ".join(parts)


def wrap_psycopg() -> None:
    """Patch psycopg2 and/or psycopg (v3) so connect() picks up Vigil
    identity automatically.

    Importing this is intentionally easy:

        from vigil import wrap_psycopg
        wrap_psycopg()
        # subsequent psycopg2.connect(...) / psycopg.connect(...) calls
        # have application_name attached for free.

    The patch is idempotent: calling it twice has no additional effect.
    Modules that aren't importable on the current interpreter are
    silently skipped — wrap_psycopg() works whether you have psycopg2,
    psycopg3, both, or neither installed.
    """
    _patch_psycopg2()
    _patch_psycopg3()


# Sentinel to mark already-patched callables so a double-call doesn't
# nest wrappers. We set this attribute on the wrapper function.
_PATCH_ATTR = "_vigil_wrapped"


def _patch_psycopg2() -> None:
    try:
        import psycopg2  # type: ignore
    except ImportError:
        return

    orig_connect = psycopg2.connect
    if getattr(orig_connect, _PATCH_ATTR, False):
        return

    def patched(*args, **kwargs):
        # psycopg2.connect supports both a positional DSN and a flat
        # kwargs form. We handle both.
        if args and isinstance(args[0], str):
            new_args = (wrap_dsn(args[0]),) + args[1:]
            return orig_connect(*new_args, **kwargs)

        dsn = kwargs.pop("dsn", None)
        if dsn:
            return orig_connect(wrap_dsn(dsn), *args, **kwargs)

        # Pure kwargs form — inject application_name directly.
        tok = token()
        if tok:
            existing = kwargs.get(APP_NAME_KEY, "")
            kwargs[APP_NAME_KEY] = (
                f"{existing}:vigil:{tok}" if existing else f"vigil:{tok}"
            )
        return orig_connect(*args, **kwargs)

    setattr(patched, _PATCH_ATTR, True)
    psycopg2.connect = patched  # type: ignore[assignment]


def _patch_psycopg3() -> None:
    try:
        import psycopg  # type: ignore
    except ImportError:
        return

    orig_connect = psycopg.connect
    if getattr(orig_connect, _PATCH_ATTR, False):
        return

    def patched(conninfo="", *args, **kwargs):
        # psycopg3.connect's first positional is `conninfo`, the DSN.
        if conninfo:
            conninfo = wrap_dsn(conninfo)
        else:
            tok = token()
            if tok:
                existing = kwargs.get(APP_NAME_KEY, "")
                kwargs[APP_NAME_KEY] = (
                    f"{existing}:vigil:{tok}" if existing else f"vigil:{tok}"
                )
        return orig_connect(conninfo, *args, **kwargs)

    setattr(patched, _PATCH_ATTR, True)
    psycopg.connect = patched  # type: ignore[assignment]
