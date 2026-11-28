import { ConflictException } from '@nestjs/common';

import { createAttractapCardHandlerFixture } from './fixtures/handler.test-fixture';
import { resetTestFixture } from './fixtures/setup.test-fixture';
import { ARMED_CARD_OPERATION_TTL_MS } from './card.handler';

/**
 * ATT-1426: an enrollment or reset whose result or cancel never reaches the server must not keep the reader
 * busy for as long as its connection stays registered.
 */
describe('AttractapCardHandler armed card operations that never finish', () => {
  const scope = createAttractapCardHandlerFixture();
  const operations = {
    enrollment: () => scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 }),
    reset: () => scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 }),
  };
  const armed = [
    ['enrollment', 'enrollment'],
    ['enrollment', 'reset'],
    ['reset', 'enrollment'],
    ['reset', 'reset'],
  ] as const;

  beforeEach(() => {
    resetTestFixture(scope);
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterEach(() => jest.useRealTimers());

  it.each(armed)('keeps the reader busy while a lost %s can still finish, then arms a %s', async (lost, next) => {
    const socket = scope.createMockSocket();
    scope.websocketService.sockets.set(socket.id, socket);
    await operations[lost]();

    jest.advanceTimersByTime(ARMED_CARD_OPERATION_TTL_MS);
    await expect(operations[next]()).rejects.toThrow(new ConflictException('READER_BUSY'));

    jest.advanceTimersByTime(1);
    await expect(operations[next]()).resolves.toBeUndefined();
    expect(Boolean(socket.state.enrollment)).toBe(next === 'enrollment');
    expect(Boolean(socket.state.resetNfcCardData)).toBe(next === 'reset');
  });
});
