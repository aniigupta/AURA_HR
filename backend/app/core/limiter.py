import redis
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import settings

# Single shared Limiter instance for the whole app. Previously auth.py built
# its own separate Limiter with its own in-memory storage, independent of the
# one registered as app.state.limiter in main.py — meaning login/refresh/
# change-password/forgot-password were rate-limited against different state
# than every other route. One shared instance, backed by Redis, fixes both
# the split-brain and the fact that in-memory storage doesn't work correctly
# once more than one backend replica is running.
#
# in_memory_fallback_enabled=True: if Redis is briefly unreachable (restart,
# network blip, or simply not configured in a local dev/test run), rate
# limiting degrades to per-process in-memory storage rather than taking every
# request down — a Redis outage should never become a login outage.
# Short socket timeouts so an unreachable/down Redis fails fast into the
# in-memory fallback instead of stalling every request behind a slow TCP
# timeout — a Redis blip should be invisible to users, not add latency.
_REDIS_SOCKET_TIMEOUT_SECONDS = 0.5

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.REDIS_URL,
    storage_options={
        "socket_connect_timeout": _REDIS_SOCKET_TIMEOUT_SECONDS,
        "socket_timeout": _REDIS_SOCKET_TIMEOUT_SECONDS,
    },
    default_limits=[settings.RATE_LIMIT_DEFAULT],
    in_memory_fallback_enabled=True,
)

# Shared Redis client for non-rate-limit uses (e.g. login lockout counters in
# app/core/utils.py). decode_responses=True so callers get str, not bytes.
redis_client = redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=_REDIS_SOCKET_TIMEOUT_SECONDS,
    socket_timeout=_REDIS_SOCKET_TIMEOUT_SECONDS,
)
