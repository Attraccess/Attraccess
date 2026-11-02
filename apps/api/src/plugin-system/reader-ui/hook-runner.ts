import { CircuitBreaker } from './circuit-breaker';

export type HookFailureCode = 'timeout' | 'exception' | 'invalid-result' | 'breaker-open';
export type HookCall<T> = { kind: 'ok'; value: T } | { kind: 'failure'; code: HookFailureCode };
export type BreakerTransition = 'open' | 'closed' | null;

class HookFailure extends Error {
  constructor(public readonly code: 'timeout' | 'invalid-result') {
    super(code);
  }
}

/** A usable result that counts neither as a success nor as a failure for the breaker. */
export class NeutralResult<T> {
  constructor(readonly value: T) {}
}

export interface HookRunnerOptions {
  timeoutMs: number;
  breakerThreshold: number;
  breakerProbeAfterMs: number;
}

/**
 * Calls plugin code with a timeout behind one circuit breaker per key. A result that fails validation counts
 * as a failure, like a timeout or an exception; a `NeutralResult` leaves the breaker as it is. Never throws.
 */
export class HookRunner {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly options: HookRunnerOptions) {}

  get timeoutMs(): number {
    return this.options.timeoutMs;
  }

  reset(key: string): void {
    this.breakers.get(key)?.reset();
  }

  async run<R, T>(
    key: string,
    call: () => R | Promise<R>,
    validate: (raw: R) => T | NeutralResult<T> | null,
  ): Promise<{ result: HookCall<T>; transition: BreakerTransition; error?: unknown }> {
    const breaker = this.breaker(key);
    if (breaker.next(Date.now()) === 'open')
      return { result: { kind: 'failure', code: 'breaker-open' }, transition: null };
    try {
      const value = validate(await this.withTimeout(call));
      if (value === null) throw new HookFailure('invalid-result');
      if (value instanceof NeutralResult) {
        breaker.release();
        return { result: { kind: 'ok', value: value.value }, transition: null };
      }
      return { result: { kind: 'ok', value }, transition: breaker.success() ? 'closed' : null };
    } catch (error) {
      const code = error instanceof HookFailure ? error.code : 'exception';
      return { result: { kind: 'failure', code }, transition: breaker.failure(Date.now()) ? 'open' : null, error };
    }
  }

  /** Plain timeout without a breaker, e.g. for a plugin's answer callback. Rejects on timeout. */
  withTimeout<R>(call: () => R | Promise<R>): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => reject(new HookFailure('timeout')), this.options.timeoutMs);
      Promise.resolve()
        .then(call)
        .then(resolve, reject)
        .finally(() => clearTimeout(timer));
    });
  }

  private breaker(key: string): CircuitBreaker {
    let breaker = this.breakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker(this.options.breakerThreshold, this.options.breakerProbeAfterMs);
      this.breakers.set(key, breaker);
    }
    return breaker;
  }
}
