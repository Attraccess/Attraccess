import { DatabaseTransactions, OperationToken, TransactionDriver } from '../transaction-scope';

/** Neutral operation bindings with the production scope lifecycle and commit callbacks. */
export function operationTransactionsFake() {
  const bindings = new Map<symbol, object>();
  const driver: TransactionDriver = {
    backend: 'fake',
    run: jest.fn(async (_conflicts, work) =>
      work({
        resolve: <T extends object>(token: OperationToken<T>): T => {
          const operations = bindings.get(token.id);
          if (!operations) throw new Error(`Unbound test operations: ${token.description}`);
          return operations as T;
        },
      }),
    ),
  };
  return {
    transactions: new DatabaseTransactions(driver),
    run: driver.run as jest.MockedFunction<TransactionDriver['run']>,
    bind: <T extends object>(token: OperationToken<T>, operations: T) => {
      bindings.set(token.id, operations);
    },
  };
}
