import asyncio
import logging
import random
import time
from functools import wraps
from typing import Any, Callable, TypeVar, Iterable

T = TypeVar("T")
logger = logging.getLogger(__name__)

class CircuitBreakerOpenException(Exception):
    pass

class CircuitBreaker:
    """
    Stateful circuit breaker to prevent cascading failures.
    Transitions: CLOSED -> OPEN (after threshold errors) -> HALF-OPEN (after timeout)
    """
    def __init__(self, name: str, threshold: int = 5, timeout: float = 30.0):
        self.name = name
        self.threshold = threshold
        self.timeout = timeout
        self.failures = 0
        self.opened_at: float | None = None
        self.state = "CLOSED"

    def record_success(self):
        self.failures = 0
        self.opened_at = None
        if self.state != "CLOSED":
            logger.info("Circuit breaker [%s] CLOSED.", self.name)
            self.state = "CLOSED"

    def record_failure(self):
        self.failures += 1
        if self.state == "CLOSED" and self.failures >= self.threshold:
            self.opened_at = time.monotonic()
            self.state = "OPEN"
            logger.error("Circuit breaker [%s] is now OPEN after %d failures.", self.name, self.failures)

    def check(self):
        if self.state == "OPEN":
            if self.opened_at and (time.monotonic() - self.opened_at) > self.timeout:
                self.state = "HALF-OPEN"
                logger.info("Circuit breaker [%s] HALF-OPEN (testing next request).", self.name)
                return
            raise CircuitBreakerOpenException(f"Circuit breaker [{self.name}] is OPEN.")

def with_retry_and_circuit(
    cb: CircuitBreaker,
    exceptions: Iterable[type[Exception]] = (Exception,),
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 10.0,
):
    """
    Decorator that applies standard retries with exponential backoff + jitter,
    combined with a named Circuit Breaker.
    """
    def decorator(func: Callable[..., Any]):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cb.check()
            last_err = None
            delay = base_delay

            for attempt in range(max_retries + 1):
                try:
                    result = await func(*args, **kwargs)
                    cb.record_success()
                    return result
                except CircuitBreakerOpenException:
                    raise
                except tuple(exceptions) as e:
                    last_err = e
                    cb.record_failure()
                    
                    if attempt == max_retries:
                        break
                    
                    if cb.state == "OPEN":
                        # Do not retry if the circuit just flipped open
                        break
                    
                    # Exponential backoff with jitter
                    jitter = random.uniform(0, 0.1 * delay)
                    sleep_time = min(max_delay, delay + jitter)
                    logger.warning(
                        "Attempt %d failed in [%s]: %s. Retrying in %.2fs...",
                        attempt + 1, cb.name, last_err, sleep_time
                    )
                    await asyncio.sleep(sleep_time)
                    delay *= 2.0
                    
            logger.error("[%s] Failed after %d retries.", cb.name, max_retries)
            raise last_err or Exception(f"Unknown error in {cb.name}")

        return wrapper
    return decorator
