"""
Async Postgres connection pool via asyncpg + SQLAlchemy Core.

Every query must be scoped by owner_id or user_id — the helper
get_db() provides the engine, and all data-access functions in
services/ accept an owner_id argument that is always applied.

The API uses the Supabase service key connection string (bypasses RLS).
RLS policies in the migration are the second-layer defence for any
direct client connections.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Optional, Union

from sqlalchemy import Delete, Select, Update
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    create_async_engine,
)
from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions
from supabase_auth import SyncMemoryStorage

from app.core.config import setting

# ── Async Postgres Connection Pool (SQLAlchemy Core + asyncpg) ────────────────

_engine: Optional[AsyncEngine] = None
_engine_loop: Optional[asyncio.AbstractEventLoop] = None


def get_db(db_url: Optional[str] = None) -> AsyncEngine:
    """Return the shared SQLAlchemy AsyncEngine backed by a connection pool.

    The engine connects via the Supabase service key connection string, which
    bypasses Postgres Row-Level Security (RLS). Every query executed in services/
    must therefore be explicitly scoped by owner_id or user_id.

    Args:
        db_url: Optional override connection string (useful in testing).
                If omitted, setting.async_database_url is used.

    Usage:
        engine = get_db()
        async with engine.connect() as conn:
            result = await conn.execute(statement)

        # Or with automatic transaction management:
        async with engine.begin() as conn:
            await conn.execute(statement)
    """
    global _engine, _engine_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    # Reset engine if event loop was recreated (common in test runners)
    if _engine is not None and current_loop is not None and _engine_loop is not None and _engine_loop != current_loop:
        _engine = None

    target_url = db_url or setting.async_database_url
    if not target_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Please configure DATABASE_URL "
            "(e.g. postgresql+asyncpg://postgres:[password]@db.[project-ref].supabase.co:5432/postgres) "
            "in your .env file."
        )

    # If an engine already exists for the default URL, reuse it; otherwise create a new one
    if _engine is None or db_url is not None:
        engine_kwargs: dict = {"echo": False}
        if "sqlite" in target_url:
            from sqlalchemy.pool import StaticPool

            engine_kwargs["poolclass"] = StaticPool
        else:
            engine_kwargs.update(
                {
                    "pool_size": 10,
                    "max_overflow": 10,
                    "pool_timeout": 30,
                    "pool_recycle": 1800,  # recycle idle connections every 30m
                    "pool_pre_ping": True,  # verify connection health before checkout
                }
            )
            # Supabase pooler (port 6543 / PgBouncer / Supavisor) does not support prepared statements
            if "pooler.supabase.com" in target_url or ":6543" in target_url:
                engine_kwargs["connect_args"] = {
                    "statement_cache_size": 0,
                    "prepared_statement_cache_size": 0,
                }
        new_engine = create_async_engine(target_url, **engine_kwargs)
        if db_url is None:
            _engine = new_engine
            _engine_loop = current_loop
        return new_engine

    return _engine


@asynccontextmanager
async def get_db_connection(engine: Optional[AsyncEngine] = None) -> AsyncIterator[AsyncConnection]:
    """Async context manager that checks out a connection from the pool.

    Usage:
        async with get_db_connection() as conn:
            result = await conn.execute(stmt)
    """
    eng = engine or get_db()
    async with eng.connect() as conn:
        yield conn


@asynccontextmanager
async def get_db_transaction(engine: Optional[AsyncEngine] = None) -> AsyncIterator[AsyncConnection]:
    """Async context manager that checks out a connection within a transaction.

    Automatically commits when the block exits successfully, or rolls back
    if an unhandled exception occurs.

    Usage:
        async with get_db_transaction() as conn:
            await conn.execute(insert_stmt)
            await conn.execute(update_stmt)
    """
    eng = engine or get_db()
    async with eng.begin() as conn:
        yield conn


async def close_db() -> None:
    """Dispose of the connection pool (call during application shutdown)."""
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None


# ── Query Scoping Enforcement ─────────────────────────────────────────────────
# Because the API uses the service connection (which bypasses Postgres RLS),
# every data-access query in services/ MUST include owner_id or user_id.


def scope_by_owner(
    stmt: Union[Select, Update, Delete],
    table,
    owner_id: str,
    column_name: str = "owner_id",
) -> Union[Select, Update, Delete]:
    """Attach an owner_id / user_id WHERE clause to a SQLAlchemy Core statement.

    Args:
        stmt: The SQLAlchemy Select, Update, or Delete statement.
        table: The SQLAlchemy Table object.
        owner_id: The owner or user ID to scope the query by.
        column_name: Name of the owner column on the table (defaults to 'owner_id').

    Returns:
        The scoped statement with WHERE table.c.<column_name> == owner_id added.
    """
    column = getattr(table.c, column_name)
    return stmt.where(column == owner_id)


# ── Supabase REST / Auth Client compatibility ─────────────────────────────────
# Provides db and db_admin clients used by app.core.auth for GoTrue JWT verification
# and Supabase Auth admin tasks.


def _make_options(**kwargs) -> ClientOptions:
    """Return a ClientOptions instance with compatibility shims for supabase-py."""
    opts = ClientOptions(**kwargs)
    if not hasattr(opts, "storage"):
        opts.storage = SyncMemoryStorage()  # type: ignore[attr-defined]
    if not hasattr(opts, "httpx_client"):
        opts.httpx_client = None  # type: ignore[attr-defined]
    return opts


# Public client (anon key, respects RLS) - used by auth.py
db: Optional[Client] = None
if setting.supabase_url and setting.supabase_publishable_key:
    db = create_client(
        setting.supabase_url,
        setting.supabase_publishable_key,
        options=_make_options(
            postgrest_client_timeout=30,
            storage_client_timeout=30,
            persist_session=False,
            auto_refresh_token=False,
        ),
    )

# Admin client (service-role key) - used for server-side auth administration
db_admin: Optional[Client] = None
if setting.supabase_url and (setting.supabase_secret_key or setting.supabase_publishable_key):
    db_admin = create_client(
        setting.supabase_url,
        setting.supabase_secret_key or setting.supabase_publishable_key,
        options=_make_options(
            postgrest_client_timeout=30,
            storage_client_timeout=30,
            persist_session=False,
            auto_refresh_token=False,
        ),
    )
