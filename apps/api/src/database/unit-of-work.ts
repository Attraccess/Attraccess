import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger } from '@nestjs/common';

/**
 * The explicit scope of one atomic unit of work: every persistence write made through it commits or rolls back
 * together (session, bill, form, metering and audit writes of one operation). Adapters hand their own transaction
 * handle to the ports they implement through `UnitOfWorkAdapter.handleOf`; application code only sees this surface.
 */
export interface TransactionScope {
  /** True from the start of the unit of work until it committed or rolled back. */
  readonly isOpen: boolean;
  /**
   * Registers work that runs only after the outermost unit of work committed: notifications, emails, device
   * commands, MQTT publishes. It never runs on rollback. A failing callback is logged and does not undo the commit
   * or stop the remaining callbacks. Callbacks run in registration order.
   */
  afterCommit(callback: () => void | Promise<void>): void;
}

export class TransactionScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionScopeError';
  }
}

/** The application-facing port. */
export interface UnitOfWork {
  /**
   * Runs `work` in a transaction and commits when it resolves, rolls back when it throws. A call made while a unit
   * of work is already running in the same async flow joins it (the parent scope is reused, nothing nests).
   * Never perform external effects inside `work`: a database retry may run it again. Use `scope.afterCommit`.
   */
  run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T>;
  /** The scope running in the current async flow, if any. */
  current(): TransactionScope | undefined;
}

/** DI token under which a backend adapter provides its UnitOfWork. */
export const UNIT_OF_WORK = Symbol.for('attraccess.unit-of-work');

/** What an engine provides: one atomic transaction around `work`, with the engine's handle passed through. */
export interface TransactionDriver<THandle> {
  transaction<T>(work: (handle: THandle) => Promise<T>): Promise<T>;
}

class ScopeImpl<THandle> implements TransactionScope {
  private open = true;
  private readonly callbacks: Array<() => void | Promise<void>> = [];
  constructor(
    readonly handle: THandle,
    readonly owner: object,
  ) {}

  get isOpen(): boolean {
    return this.open;
  }

  afterCommit(callback: () => void | Promise<void>): void {
    if (!this.open) throw new TransactionScopeError('Cannot register a post-commit callback on a closed scope');
    this.callbacks.push(callback);
  }

  close(): Array<() => void | Promise<void>> {
    this.open = false;
    return this.callbacks.splice(0);
  }
}

const logger = new Logger('UnitOfWork');

/**
 * Engine-independent unit-of-work semantics on top of a TransactionDriver. An adapter instantiates it once per
 * connection; the same instance's `handleOf` unwraps the engine handle of a scope and rejects scopes that are
 * closed or belong to another unit of work instance (another connection).
 */
export class ScopedUnitOfWork<THandle> implements UnitOfWork {
  private readonly flow = new AsyncLocalStorage<ScopeImpl<THandle>>();

  constructor(private readonly driver: TransactionDriver<THandle>) {}

  current(): TransactionScope | undefined {
    return this.flow.getStore();
  }

  async run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T> {
    const parent = this.flow.getStore();
    if (parent?.isOpen) return work(parent);
    let scope: ScopeImpl<THandle> | undefined;
    let result: T;
    try {
      result = await this.driver.transaction((handle) => {
        const created = new ScopeImpl(handle, this);
        scope = created;
        return this.flow.run(created, () => work(created));
      });
    } catch (error) {
      scope?.close();
      throw error;
    }
    const callbacks = scope?.close() ?? [];
    for (const callback of callbacks) {
      try {
        await callback();
      } catch (error) {
        logger.error(`A post-commit callback failed: ${error instanceof Error ? error.name : 'unknown error'}`);
      }
    }
    return result;
  }

  /** The engine handle behind a scope. Throws for a closed scope or a scope of another unit of work. */
  handleOf(scope: TransactionScope): THandle {
    if (!(scope instanceof ScopeImpl) || scope.owner !== this) {
      throw new TransactionScopeError('The transaction scope belongs to another unit of work');
    }
    if (!scope.isOpen) throw new TransactionScopeError('The transaction scope is closed');
    return scope.handle;
  }
}
