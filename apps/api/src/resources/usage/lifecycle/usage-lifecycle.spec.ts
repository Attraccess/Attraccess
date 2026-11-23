import { ConflictException } from '@nestjs/common';
import type { UsageLifecycleAttempt } from '@attraccess/application-models';
import type { TransactionScope } from '../../../database/unit-of-work';
import { FormImageUnavailableError, MissingBillingTransactionError } from '../usage-session-store.port';
import { UsageLifecycle } from './usage-lifecycle';

describe('UsageLifecycle.applyLifecycleDrafts', () => {
  const lifecycle = (applyAttemptDrafts: jest.Mock) =>
    new UsageLifecycle(
      { applyAttemptDrafts } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      {} as never,
    );
  const scope = {} as TransactionScope;
  const attempt = { id: 'attempt-1' } as UsageLifecycleAttempt;

  it.each([
    ['an image of the answer is no longer available', new FormImageUnavailableError()],
    ['the session has no bill', new MissingBillingTransactionError()],
  ])('answers 409 when %s', async (_name, error) => {
    const store = jest.fn().mockRejectedValue(error);

    await expect(lifecycle(store).applyLifecycleDrafts(scope, attempt)).rejects.toBeInstanceOf(ConflictException);
    expect(store).toHaveBeenCalledWith(attempt, scope);
  });

  it('passes any other error on', async () => {
    const failure = new Error('db down');
    await expect(lifecycle(jest.fn().mockRejectedValue(failure)).applyLifecycleDrafts(scope, attempt)).rejects.toBe(
      failure,
    );
  });
});
