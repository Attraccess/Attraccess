import { AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { Subject } from 'rxjs';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { LiveUpdatesController } from './live-updates.controller';
import { LiveUpdatesService } from './live-updates.service';

describe('session credential binding', () => {
  it('binds stream and controls to cookie credentials even though runtime users have no jwtTokenId', () => {
    const live = {
      open: jest.fn((_id: string, _user: AuthenticatedUser) => new Subject()),
      update: jest.fn((_id: string, _user: AuthenticatedUser, _body: unknown) => undefined),
    };
    const metrics = { wrap: jest.fn((_name, source) => source) };
    const controller = new LiveUpdatesController(
      live as unknown as LiveUpdatesService,
      metrics as unknown as SseInstrumentation,
    );
    const request = { user: { id: 1 }, cookies: { 'auth-session': 'session-a' }, headers: {} } as AuthenticatedRequest;
    controller.stream('id', request);
    controller.update('id', request, {});
    const principal = live.open.mock.calls[0][1];
    expect(principal.jwtTokenId).toMatch(/^[a-f0-9]{64}$/);
    expect(principal.jwtTokenId).not.toBe('session-a');
    expect(live.update.mock.calls[0][1]).toEqual(principal);
    controller.stream('id', { ...request, cookies: { 'auth-session': 'session-b' } });
    expect(live.open.mock.calls[1][1].jwtTokenId).not.toBe(principal.jwtTokenId);
  });
});
