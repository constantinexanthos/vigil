"""Vigil Python client helper.

Attach a Vigil identity token to your Postgres connection so vigil-proxy
sees who's talking. The helper reads ``VIGIL_TOKEN`` from the
environment and injects ``application_name=vigil:<token>`` at connect
time.

Public API:

    from vigil import wrap_dsn, wrap_psycopg, token

    # Direct DSN editing (works with asyncpg, SQLAlchemy, anything):
    dsn = wrap_dsn(os.environ["DATABASE_URL"])

    # Monkey-patch psycopg2 + psycopg3 so EVERY connect() call gets
    # identity attached automatically:
    wrap_psycopg()

When ``VIGIL_TOKEN`` is unset, both APIs are no-ops — code works
unchanged in environments without vigil-run (CI, local Postgres, etc).
"""

from .wrap import wrap_dsn, wrap_psycopg, token

__all__ = ["wrap_dsn", "wrap_psycopg", "token"]
__version__ = "0.1.0"
