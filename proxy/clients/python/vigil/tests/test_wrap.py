"""Unit tests for vigil.wrap.

We test the pure ``wrap_dsn`` API and the monkey-patch ``wrap_psycopg``
contract. The monkey-patch tests use ``unittest.mock`` to stub out
``psycopg2.connect`` / ``psycopg.connect`` so we don't need a real
Postgres reachable — the spec's acceptance criteria are unit-test
only on the helper side; end-to-end checks belong in the Go integration
test where the proxy is in scope.
"""

from __future__ import annotations

import os
import urllib.parse
from typing import Any, Iterator
from unittest import mock

import pytest

from vigil import wrap_dsn, wrap_psycopg, token
from vigil.wrap import ENV_VAR, APP_NAME_KEY


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture
def with_token(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """Set VIGIL_TOKEN to a known value for the test, restore on teardown."""
    val = "test-token-7c2a"
    monkeypatch.setenv(ENV_VAR, val)
    yield val


@pytest.fixture
def without_token(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.delenv(ENV_VAR, raising=False)
    yield


# -----------------------------------------------------------------------------
# wrap_dsn — URL form
# -----------------------------------------------------------------------------


def test_wrap_dsn_url_attaches_token(with_token: str) -> None:
    dsn = "postgres://app:secret@localhost:5432/mydb?sslmode=disable"
    out = wrap_dsn(dsn)
    parsed = urllib.parse.urlparse(out)
    q = dict(urllib.parse.parse_qsl(parsed.query))
    assert q[APP_NAME_KEY] == f"vigil:{with_token}"
    assert q["sslmode"] == "disable"


def test_wrap_dsn_url_preserves_existing_app_name(with_token: str) -> None:
    dsn = "postgres://app:secret@localhost:5432/mydb?application_name=my-app"
    out = wrap_dsn(dsn)
    q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(out).query))
    assert q[APP_NAME_KEY] == f"my-app:vigil:{with_token}"


def test_wrap_dsn_url_postgresql_scheme(with_token: str) -> None:
    """postgresql:// is the libpq-canonical scheme; postgres:// is also valid."""
    out = wrap_dsn("postgresql://localhost/mydb")
    assert f"application_name=vigil%3A{with_token}" in out or f"application_name=vigil:{with_token}" in out


# -----------------------------------------------------------------------------
# wrap_dsn — key=value form
# -----------------------------------------------------------------------------


def test_wrap_dsn_kv_attaches_token(with_token: str) -> None:
    dsn = "host=localhost port=5432 user=app dbname=mydb"
    out = wrap_dsn(dsn)
    assert f"application_name=vigil:{with_token}" in out
    # Other keys must survive.
    for fragment in ("host=localhost", "port=5432", "user=app", "dbname=mydb"):
        assert fragment in out, f"missing {fragment} in {out!r}"


def test_wrap_dsn_kv_preserves_existing_app_name(with_token: str) -> None:
    dsn = "host=localhost user=app application_name=my-svc dbname=mydb"
    out = wrap_dsn(dsn)
    assert f"application_name=my-svc:vigil:{with_token}" in out


# -----------------------------------------------------------------------------
# No-op contract
# -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "dsn",
    [
        "postgres://app:secret@localhost/mydb",
        "host=localhost dbname=mydb",
        "",
    ],
)
def test_wrap_dsn_no_token_is_noop(without_token: None, dsn: str) -> None:
    assert wrap_dsn(dsn) == dsn


def test_token_returns_none_without_env(without_token: None) -> None:
    assert token() is None


def test_token_returns_value_with_env(with_token: str) -> None:
    assert token() == with_token


# -----------------------------------------------------------------------------
# wrap_psycopg — psycopg2 path
# -----------------------------------------------------------------------------
#
# The pattern below carefully orders mock.patch *before* wrap_psycopg() so
# our wrapper closes over the mock rather than the real psycopg2.connect.
# Then we look up psycopg2.connect a second time to obtain the wrapper
# itself (the patch hook is now our function, which calls into the mock).
# Each test also restores the original psycopg2.connect to avoid leaking
# patched state between tests — the wrapper is keyed on a module
# attribute, and pytest's module-level imports persist across tests.


@pytest.fixture
def fake_psycopg2(monkeypatch: pytest.MonkeyPatch):
    """Replace psycopg2.connect with a recording stub, then call
    wrap_psycopg() so the wrapper closes over our stub. Returns the
    captured-args dict for assertions."""
    import psycopg2  # type: ignore

    captured: dict[str, Any] = {}

    def fake_connect(*args, **kwargs):  # type: ignore[no-untyped-def]
        captured["args"] = args
        captured["kwargs"] = kwargs
        return mock.MagicMock(name="fake_conn")

    original = psycopg2.connect
    monkeypatch.setattr(psycopg2, "connect", fake_connect)
    wrap_psycopg()  # wraps the stub
    yield captured
    # Restore the original so the wrapper closure (which still points at
    # the stub) doesn't leak across tests.
    monkeypatch.setattr(psycopg2, "connect", original)


def test_wrap_psycopg_patches_psycopg2_connect_dsn(
    with_token: str, fake_psycopg2: dict[str, Any]
) -> None:
    import psycopg2

    psycopg2.connect("postgres://app:pw@h/db")
    assert "args" in fake_psycopg2, "psycopg2.connect was not called"
    dsn = fake_psycopg2["args"][0]
    assert (
        f"application_name=vigil:{with_token}" in dsn
        or f"application_name=vigil%3A{with_token}" in dsn
    ), f"DSN missing vigil token: {dsn!r}"


def test_wrap_psycopg_patches_psycopg2_connect_kwargs(
    with_token: str, fake_psycopg2: dict[str, Any]
) -> None:
    import psycopg2

    psycopg2.connect(host="localhost", dbname="mydb", user="app")
    assert fake_psycopg2["kwargs"]["application_name"] == f"vigil:{with_token}"


def test_wrap_psycopg_idempotent(
    with_token: str, fake_psycopg2: dict[str, Any]
) -> None:
    """Calling wrap_psycopg twice doesn't nest wrappers."""
    import psycopg2

    # fake_psycopg2 fixture already called wrap_psycopg() once. Call again.
    wrap_psycopg()
    psycopg2.connect("postgres://app:pw@h/db")

    dsn = fake_psycopg2["args"][0]
    # Exactly one vigil prefix; nested wrappers would produce two.
    # urlencoded form (vigil%3A) is what urllib.parse emits.
    count = dsn.count("vigil:") + dsn.count("vigil%3A")
    assert count == 1, f"nested wrappers in {dsn!r}: count={count}"


def test_wrap_psycopg_noop_without_token(
    without_token: None, fake_psycopg2: dict[str, Any]
) -> None:
    """Without VIGIL_TOKEN, the wrapper passes the DSN through unchanged."""
    import psycopg2

    dsn_in = "postgres://app:pw@h/db"
    psycopg2.connect(dsn_in)
    assert fake_psycopg2["args"][0] == dsn_in


# -----------------------------------------------------------------------------
# wrap_psycopg — psycopg3 path
# -----------------------------------------------------------------------------


@pytest.fixture
def fake_psycopg3(monkeypatch: pytest.MonkeyPatch):
    psycopg3 = pytest.importorskip("psycopg")

    captured: dict[str, Any] = {}

    def fake_connect(conninfo="", *args, **kwargs):  # type: ignore[no-untyped-def]
        captured["conninfo"] = conninfo
        captured["args"] = args
        captured["kwargs"] = kwargs
        return mock.MagicMock(name="fake_conn")

    original = psycopg3.connect
    monkeypatch.setattr(psycopg3, "connect", fake_connect)
    wrap_psycopg()
    yield captured
    monkeypatch.setattr(psycopg3, "connect", original)


def test_wrap_psycopg_patches_psycopg3_connect(
    with_token: str, fake_psycopg3: dict[str, Any]
) -> None:
    psycopg3 = pytest.importorskip("psycopg")
    psycopg3.connect("postgres://app:pw@h/db")
    conninfo = fake_psycopg3["conninfo"]
    assert (
        f"application_name=vigil:{with_token}" in conninfo
        or f"application_name=vigil%3A{with_token}" in conninfo
    ), f"conninfo missing vigil token: {conninfo!r}"
