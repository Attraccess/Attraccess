import { EventEmitter } from 'node:events';
import { instanceToPlain } from 'class-transformer';
import { SupervisionController } from './supervision.controller';

describe('Supervision response and cancellation', () => {
  const request = { user: { id: 1 } };
  const usage = { id: 7, user: { id: 1, username: 'operator', passwordResetToken: 'secret' } };

  it('filters plain usage responses while cleaning up the disconnect listener', async () => {
    const service = {
      requestSupervisedSession: jest.fn((_resource: number, _user: unknown, _dto: unknown, _signal: AbortSignal) =>
        Promise.resolve(usage),
      ),
      approve: jest.fn().mockResolvedValue(usage),
    };
    const controller = new SupervisionController(service as never, {} as never, {} as never);
    const response = Object.assign(new EventEmitter(), { writableEnded: false });
    const result = await controller.requestSupervisedSession(2, {} as never, request as never, response as never);
    expect(instanceToPlain(result)).toEqual({ id: 7, user: { id: 1, username: 'operator' } });
    expect(instanceToPlain(await controller.approveRequest('request', request as never))).toEqual(
      instanceToPlain(result),
    );
    expect(service.requestSupervisedSession.mock.calls[0][3].aborted).toBe(false);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('cancels pending supervision when the client disconnects and removes the listener', async () => {
    const service = {
      requestSupervisedSession: jest.fn(
        (_resource, _user, _dto, signal: AbortSignal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('Request cancelled')), { once: true });
          }),
      ),
    };
    const controller = new SupervisionController(service as never, {} as never, {} as never);
    const response = Object.assign(new EventEmitter(), { writableEnded: false });
    const result = controller.requestSupervisedSession(2, {} as never, request as never, response as never);
    response.emit('close');
    await expect(result).rejects.toThrow('Request cancelled');
    expect(response.listenerCount('close')).toBe(0);
  });
});
