import logging
import time
import uuid
import contextvars
from typing import Callable, Awaitable
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Context variables for ubiquitous structured logging
tenant_id_ctx = contextvars.ContextVar("tenant_id", default="-")
request_id_ctx = contextvars.ContextVar("request_id", default="-")

class TenantLogFilter(logging.Filter):
    """
    FAANG Requirement: Structured Logging with Correlation & Tenant IDs.
    Automatically injects `tenant_id` and `request_id` into all logs across the system.
    """
    def filter(self, record):
        record.tenant_id = tenant_id_ctx.get()
        record.request_id = request_id_ctx.get()
        return True

class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """
    Records request duration, correlated request/trace IDs, and standardizes
    the format for downstream aggregators like Datadog, ELK, or Loki.
    Enforces Tenant Isolation tracking at the physical log layer.
    """
    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        start_time = time.perf_counter()
        
        # Extract and set Request ID
        req_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = req_id
        request_id_ctx.set(req_id)
        
        # Lazily set tenant id if user is parsed later, initialized to unknown
        tenant_id_ctx.set("unauthenticated")

        client_host = request.client.host if request.client else "unknown"
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_host = forwarded.split(",")[0].strip()

        try:
            response = await call_next(request)
            
            # If auth middleware attached a user, update context
            user_id = getattr(request.state, "user_id", None)
            if user_id:
                tenant_id_ctx.set(str(user_id))

            process_time_ms = (time.perf_counter() - start_time) * 1000
            
            logger = logging.getLogger("api")
            logger.info(
                "method=%s path=%s status=%s duration_ms=%.2f ip=%s",
                request.method,
                request.url.path,
                response.status_code,
                process_time_ms,
                client_host
            )
            return response
            
        except Exception as e:
            process_time_ms = (time.perf_counter() - start_time) * 1000
            user_id = getattr(request.state, "user_id", None)
            if user_id:
                tenant_id_ctx.set(str(user_id))

            logger = logging.getLogger("api")
            logger.exception(
                "UNHANDLED_EXCEPTION method=%s path=%s duration_ms=%.2f ip=%s error=%.200s",
                request.method,
                request.url.path,
                process_time_ms,
                client_host,
                str(e)
            )
            raise

def setup_logging(debug: bool) -> None:
    """Configures systemic log levels and format injected with tenant ids."""
    level = logging.DEBUG if debug else logging.INFO
    log_format = "%(asctime)s - %(name)s - %(levelname)s - [req:%(request_id)s] [tenant:%(tenant_id)s] - %(message)s"
    
    # Configure root logger
    logging.basicConfig(level=level, format=log_format)
    
    # Add filter to all existing handlers
    tenant_filter = TenantLogFilter()
    for handler in logging.root.handlers:
        handler.addFilter(tenant_filter)
