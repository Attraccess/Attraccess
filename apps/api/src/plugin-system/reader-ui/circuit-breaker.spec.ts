import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker', () => {
  it('opens after the threshold of consecutive failures and allows one probe after the wait', () => {
    const breaker = new CircuitBreaker(3, 60_000);
    expect(breaker.failure(0)).toBe(false);
    expect(breaker.failure(1)).toBe(false);
    expect(breaker.failure(2)).toBe(true);
    expect(breaker.next(30_000)).toBe('open');
    expect(breaker.next(62_002)).toBe('probe');
    expect(breaker.next(62_003)).toBe('open'); // only one probe in flight
  });

  it('closes on a successful probe and re-opens on a failed one', () => {
    const breaker = new CircuitBreaker(1, 1000);
    breaker.failure(0);
    expect(breaker.next(1000)).toBe('probe');
    breaker.failure(1000);
    expect(breaker.isOpen).toBe(true);
    expect(breaker.next(1500)).toBe('open');
    expect(breaker.next(2000)).toBe('probe');
    expect(breaker.success()).toBe(true);
    expect(breaker.next(2001)).toBe('call');
  });

  it('counts only consecutive failures and can be reset by an admin', () => {
    const breaker = new CircuitBreaker(2, 1000);
    breaker.failure(0);
    breaker.success();
    expect(breaker.failure(1)).toBe(false);
    breaker.failure(2);
    expect(breaker.isOpen).toBe(true);
    breaker.reset();
    expect(breaker.isOpen).toBe(false);
  });
});
