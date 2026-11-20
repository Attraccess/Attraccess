import { Logger } from '@nestjs/common';
import { bestEffortPush } from './best-effort-push';

describe('bestEffortPush', () => {
  const logger = { warn: jest.fn() } as unknown as Logger;

  beforeEach(() => jest.clearAllMocks());

  it('logs a rejected push instead of leaving an unhandled rejection', async () => {
    const unhandled = jest.fn();
    process.once('unhandledRejection', unhandled);
    bestEffortPush(Promise.reject(new Error('Connection terminated')), logger, 'transaction 7');
    await new Promise((resolve) => setImmediate(resolve));
    process.removeListener('unhandledRejection', unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('Failed to publish transaction 7: Connection terminated');
  });

  it('accepts a push that returns nothing and a push that resolves', async () => {
    bestEffortPush(undefined, logger, 'transaction 1');
    bestEffortPush(Promise.resolve(), logger, 'transaction 2');
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
