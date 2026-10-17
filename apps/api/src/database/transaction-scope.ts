import { Logger } from '@nestjs/common';

export interface ConflictScope {
  readonly resourceIds: readonly number[];
  readonly accountIds: readonly number[];
}

export interface OperationToken<T extends object> {
  readonly id: symbol;
  readonly description: string;
  readonly methods: readonly (keyof T)[];
}

export function operationToken<T extends object>(
  description: string,
  methods: readonly (keyof T)[],
): OperationToken<T> {
  if (!methods.length) throw new Error('Transaction operations must declare their methods');
  return Object.freeze({ id: Symbol(description), description, methods: Object.freeze([...new Set(methods)]) });
}

export interface TransactionScope {
  readonly backend: string;
  readonly conflicts: ConflictScope;
  resolve<T extends object>(token: OperationToken<T>): T;
  afterCommit(work: () => void | Promise<void>): void;
}

/** Implementation-side binder. No engine facilities cross into the supplied application scope. */
export interface TransactionOperations {
  resolve<T extends object>(token: OperationToken<T>): T;
}

export interface TransactionDriver {
  readonly backend: string;
  run<T>(conflicts: ConflictScope, work: (operations: TransactionOperations) => Promise<T>): Promise<T>;
}

interface ActiveScope {
  open: boolean;
  pendingChildren: number;
}

/** One callback attempt. Nested calls explicitly reuse their parent's transaction, without savepoints. */
export class DatabaseTransactions {
  private readonly active = new WeakMap<TransactionScope, ActiveScope>();
  private readonly logger = new Logger(DatabaseTransactions.name);

  constructor(private readonly driver: TransactionDriver) {}

  async run<T>(
    conflicts: ConflictScope,
    work: (scope: TransactionScope) => Promise<T>,
    parent?: TransactionScope,
  ): Promise<T> {
    const declared = this.validateConflicts(conflicts);
    if (parent) {
      const state = this.active.get(parent);
      if (!state?.open || parent.backend !== this.driver.backend) throw new Error('Invalid parent transaction scope');
      for (const kind of ['resourceIds', 'accountIds'] as const) {
        if (declared[kind].some((id) => !parent.conflicts[kind].includes(id))) {
          throw new Error('Nested transaction cannot expand its parent conflict scope');
        }
      }
      state.pendingChildren++;
      try {
        return await work(parent);
      } finally {
        state.pendingChildren--;
      }
    }

    const notifications: Array<() => void | Promise<void>> = [];
    const result = await this.driver.run(declared, async (operations) => {
      const state: ActiveScope = { open: true, pendingChildren: 0 };
      const assertOpen = () => {
        if (!state.open) throw new Error('Transaction scope is closed');
      };
      const instances = new Map<symbol, object>();
      const scope: TransactionScope = Object.freeze({
        backend: this.driver.backend,
        conflicts: declared,
        resolve: <T extends object>(token: OperationToken<T>): T => {
          assertOpen();
          if (!instances.has(token.id)) {
            const target = operations.resolve(token);
            instances.set(
              token.id,
              new Proxy(
                {},
                {
                  get(_object, property) {
                    assertOpen();
                    if (!token.methods.includes(property as keyof T)) return undefined;
                    const value = Reflect.get(target, property, target);
                    if (typeof value !== 'function') throw new Error('Transaction operations must be methods');
                    return (...args: unknown[]) => {
                      assertOpen();
                      return Reflect.apply(value, target, args);
                    };
                  },
                  set() {
                    throw new Error('Transaction operation interfaces are read-only');
                  },
                },
              ),
            );
          }
          return instances.get(token.id) as T;
        },
        afterCommit: (notification: () => void | Promise<void>) => {
          assertOpen();
          notifications.push(notification);
        },
      });
      this.active.set(scope, state);
      try {
        const value = await work(scope);
        if (state.pendingChildren) throw new Error('Nested transaction work must finish before its parent');
        return value;
      } finally {
        state.open = false;
      }
    });
    // The driver resolves only after the outer commit. Delivery failure cannot undo committed rows.
    for (const notification of notifications) {
      try {
        await notification();
      } catch (error) {
        this.logger.error('Post-commit notification failed', error);
      }
    }
    return result;
  }

  private validateConflicts(conflicts: ConflictScope): ConflictScope {
    for (const ids of [conflicts.resourceIds, conflicts.accountIds]) {
      if (ids.some((id) => !Number.isSafeInteger(id) || id < 1))
        throw new Error('Invalid transaction conflict identity');
    }
    return Object.freeze({
      resourceIds: Object.freeze([...new Set(conflicts.resourceIds)].sort((a, b) => a - b)),
      accountIds: Object.freeze([...new Set(conflicts.accountIds)].sort((a, b) => a - b)),
    });
  }
}
