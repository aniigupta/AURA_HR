import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

# Pool sizing matters here because every endpoint is a sync `def`, so FastAPI
# serves them from its threadpool (40 workers by default). SQLAlchemy's stock
# pool is 5 connections + 10 overflow, so under load 25 of those workers would
# sit blocked in QueuePool.connect() waiting on a connection - and after 30s
# start returning TimeoutError as 500s - while the database itself was idle.
# Sized to cover the threadpool with headroom, and overridable per deployment
# because the ceiling is really the database's own max_connections divided
# across replicas.
_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "20"))
_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "30"))

_engine_kwargs = {"pool_pre_ping": True, "pool_recycle": 3600}
if not settings.DATABASE_URL.startswith("sqlite"):
    # SQLite's default pools take neither option.
    _engine_kwargs["pool_size"] = _POOL_SIZE
    _engine_kwargs["max_overflow"] = _MAX_OVERFLOW

engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

# Dependency to get db session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

