import time
import asyncio
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

# Basic in-memory sliding window fallback 
# In multi-worker production with 10k users, this should map to Redis Rate Limiting (aioredis).
_RATE_LIMITS = {} 
BURST_LIMIT = 50
SUSTAINED_LIMIT = 100 # per minute

class AdvancedRateLimitMiddleware(BaseHTTPMiddleware):
    """
    FAANG Requirement: Security posture requires strong per-user/per-IP rate limiting.
    Implements a sliding window rate limit dropping overly aggressive API scanners.
    """
    async def dispatch(self, request: Request, call_next):
        # Prioritize authenticated user_id, fallback to IP Address 
        client_ip = request.client.host if request.client else "unknown"
        user_id = getattr(request.state, "user_id", client_ip)
        
        key = f"rl:{user_id}"
        current_time = time.monotonic()
        
        # Scavenge
        if key not in _RATE_LIMITS:
            _RATE_LIMITS[key] = []
        
        # Keep only timestamps within the last 60 seconds
        _RATE_LIMITS[key] = [t for t in _RATE_LIMITS[key] if current_time - t < 60.0]
        
        # Enforce burst and sustained thresholds
        recent_10s = len([t for t in _RATE_LIMITS[key] if current_time - t < 10.0])
        
        if recent_10s >= BURST_LIMIT or len(_RATE_LIMITS[key]) >= SUSTAINED_LIMIT:
            logger.warning("RATE_LIMIT_EXCEEDED key=%s endpoints=%s hits=%d", key, request.url.path, len(_RATE_LIMITS[key]))
            return JSONResponse(
                status_code=429,
                content={"error": "Too Many Requests", "message": "Rate limit exceeded. Slow down."}
            )
            
        _RATE_LIMITS[key].append(current_time)
        return await call_next(request)
