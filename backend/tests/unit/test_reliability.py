import pytest
import asyncio
import time
from unittest.mock import patch, MagicMock

from app.services.reliability import CircuitBreaker, CircuitBreakerOpenException, with_retry_and_circuit

@pytest.mark.asyncio
async def test_circuit_breaker_state_transitions():
    """
    FAANG Requirement: Centralized stateful circuit breaker preventing cascading failures.
    Tests transitions from CLOSED -> OPEN -> HALF-OPEN -> CLOSED.
    """
    cb = CircuitBreaker(name="test_service", threshold=3, timeout=0.1)
    assert cb.state == "CLOSED"

    # Simulate 3 failures to Trip
    for _ in range(3):
        cb.record_failure()
        
    assert cb.state == "OPEN"
    
    # Testing while OPEN raises exception immediately
    with pytest.raises(CircuitBreakerOpenException):
        cb.check()

    # Wait for timeout
    await asyncio.sleep(0.15)
    
    # Check should now pass as HALF-OPEN
    cb.check()
    assert cb.state == "HALF-OPEN"

    # A single success recovers it
    cb.record_success()
    assert cb.state == "CLOSED"

@pytest.mark.asyncio
async def test_exponential_backoff_with_jitter():
    """
    FAANG Requirement: Retry storms must be mitigated using Exponential Backoff + Jitter.
    Tests decorator execution patterns for failing dependencies.
    """
    cb = CircuitBreaker(name="api_dep", threshold=5, timeout=1.0)
    mock_func = MagicMock(side_effect=[ValueError("API timeout"), ValueError("DB dead"), "success"])

    @with_retry_and_circuit(cb=cb, exceptions=(ValueError,), max_retries=3, base_delay=0.01, max_delay=0.1)
    async def failing_service():
        return mock_func()
        
    start_time = time.monotonic()
    res = await failing_service()
    end_time = time.monotonic()
    
    assert res == "success"
    assert mock_func.call_count == 3
    # First fail -> 0.01 delay ~ + jitter
    # Second fail -> 0.02 delay ~ + jitter
    # Total delay > 0.03
    duration = end_time - start_time
    assert duration >= 0.03, f"Backoff too fast: {duration}s"
    assert cb.failures == 0 # Recorded success clears it

@pytest.mark.asyncio
async def test_circuit_breaker_aborts_retry():
    """
    If circuit breaker trips, retries should abort immediately instead of hammering the broken service.
    """
    cb = CircuitBreaker(name="db_dep", threshold=2, timeout=1.0)
    mock_func = MagicMock(side_effect=Exception("DB dead permanently"))

    @with_retry_and_circuit(cb=cb, exceptions=(Exception,), max_retries=5, base_delay=0.001)
    async def permanently_failing_service():
        return mock_func()
        
    with pytest.raises(Exception, match="DB dead permanently"):
        await permanently_failing_service()
        
    # It should abort at threshold (2) instead of retrying 5 times.
    assert cb.state == "OPEN"
    assert mock_func.call_count == 2
