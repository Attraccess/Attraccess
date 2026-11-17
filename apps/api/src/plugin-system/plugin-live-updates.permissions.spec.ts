import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthenticatedUser, definePluginPermissions, SessionOnlyGuard } from '@attraccess/plugins-backend-sdk';
import { LivePacket } from '@attraccess/shared';
import { Subject } from 'rxjs';
import { LiveTopicsService } from '../live-updates/live-topics.service';
import { LiveUpdatesController } from '../live-updates/live-updates.controller';
import { LiveUpdatesService } from '../live-updates/live-updates.service';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { PluginLiveUpdatesService } from './plugin-live-updates.service';

const ACME = definePluginPermissions({
  permissions: [
    {
      key: 'acme.devices.read',
      label: { en: 'View devices', de: 'Geräte ansehen' },
      description: { en: 'Streams device state', de: 'Streamt Gerätezustand' },
    },
  ],
});
const READ = ACME.keys['acme.devices.read'];
const connectionId = '00000000-0000-4000-8000-000000000002';
const principal = (...permissions: string[]) =>
  ({ id: 7, jwtTokenId: 'session-7', effectivePermissions: new Set(permissions) }) as unknown as AuthenticatedUser;

describe('plugin live topics authorized by a plugin-declared key', () => {
  let live: LiveUpdatesService;
  let source: Subject<object>;
  let sourceCalls: jest.Mock;
  let packets: LivePacket[];
  const subscription = { topic: 'plugin:acme:devices' };
  const body = () => ({ revision: 0, subscriptions: [subscription] });

  beforeEach(() => {
    jest.useFakeTimers();
    const topics = new LiveTopicsService();
    source = new Subject();
    sourceCalls = jest.fn(() => source.asObservable());
    new PluginLiveUpdatesService(topics).register('acme-id', 'acme', {
      topic: 'devices',
      identifier: 'none',
      authorize: (_subscription, user) => {
        if (!user.effectivePermissions?.has(READ)) throw new ForbiddenException();
      },
      source: sourceCalls,
    });
    live = new LiveUpdatesService(topics, {
      wrapTopic: jest.fn((_topic, observable) => observable),
    } as unknown as SseInstrumentation);
    packets = [];
  });

  afterEach(() => {
    live.onModuleDestroy();
    jest.useRealTimers();
  });

  it('denies subscribing without the key', async () => {
    const user = principal('resources.read');
    live.open(connectionId, user).subscribe(({ data }) => packets.push(data as LivePacket));

    await live.update(connectionId, user, body());

    expect(sourceCalls).not.toHaveBeenCalled();
    expect(packets).toContainEqual({
      type: 'rejected',
      subscription,
      reason: 'Plugin topic forbidden or unavailable',
    });
  });

  it('streams with the key and revokes the stream when a lease renewal no longer carries it', async () => {
    live.open(connectionId, principal(READ)).subscribe(({ data }) => packets.push(data as LivePacket));
    await live.update(connectionId, principal(READ), body());
    expect(sourceCalls).toHaveBeenCalledTimes(1);
    expect(source.observed).toBe(true);

    // the role lost the key, or the plugin key became unavailable
    await live.update(connectionId, principal(), body());

    expect(source.observed).toBe(false);
    expect(packets).toContainEqual({
      type: 'rejected',
      subscription,
      reason: 'Plugin topic forbidden or unavailable',
    });
  });

  it('accepts session principals only, so API tokens cannot subscribe', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, LiveUpdatesController) as unknown[];
    expect(guards).toContain(SessionOnlyGuard);
    const context = (user: Partial<AuthenticatedUser>) =>
      ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

    expect(() =>
      new SessionOnlyGuard().canActivate(
        context({ authenticationMethod: 'api-token', effectivePermissions: new Set([READ]) as never }),
      ),
    ).toThrow(ForbiddenException);
    expect(new SessionOnlyGuard().canActivate(context({ authenticationMethod: 'session' }))).toBe(true);
  });
});
