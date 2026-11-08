"""Base schema metadata and DDL utilities for SQLAlchemy Core."""

from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import AsyncEngine

# Central metadata registry for all application tables
metadata = MetaData()


async def create_all_tables(engine: AsyncEngine) -> None:
    """Create all tables defined in metadata using the provided AsyncEngine."""
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)


async def drop_all_tables(engine: AsyncEngine) -> None:
    """Drop all tables defined in metadata using the provided AsyncEngine."""
    async with engine.begin() as conn:
        await conn.run_sync(metadata.drop_all)

