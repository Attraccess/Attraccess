import { NETWORK_RESTRICTED_ACTIONS, NetworkIpSource, NetworkRestrictedAction } from '@attraccess/application-models';
import { NetworkRestrictedException } from './network-restricted.exception';
import { NetworkRestrictionConfigService } from './network-restriction-config.service';
import { NetworkRestrictionService } from './network-restriction.service';
import type { NetworkRestrictionConfig } from './network-restriction.config';
import type { NetworkRestrictionStore } from './network-restriction.port';

describe('NetworkRestrictionService', () => {
  let config: NetworkRestrictionConfig;
  let allowedForUser: NetworkRestrictedAction[];
  const store = {
    actionsAllowedForUser: jest.fn(async () => allowedForUser),
  } as unknown as NetworkRestrictionStore;
  let service: NetworkRestrictionService;

  const call = (ip: string | undefined, headers: Record<string, string> = {}, locale?: string) => ({
    ip,
    headers,
    user: { id: 7, locale },
  });

  beforeEach(() => {
    config = {
      enabled: true,
      allowedRanges: ['10.0.0.0/8', '::1/128'],
      ipSource: NetworkIpSource.Client,
      headerName: 'X-Real-Ip',
    };
    allowedForUser = [];
    jest.mocked(store.actionsAllowedForUser).mockClear();
    const configService = new NetworkRestrictionConfigService({} as never);
    jest.spyOn(configService, 'get').mockImplementation(async () => config);
    service = new NetworkRestrictionService(configService, store);
  });

  it('does nothing while the restriction is off, and does not even look at roles', async () => {
    config.enabled = false;
    await expect(service.assertAllowed(call('8.8.8.8'), NetworkRestrictedAction.UsageStart)).resolves.toBeUndefined();
    expect(store.actionsAllowedForUser).not.toHaveBeenCalled();
  });

  it('allows a caller inside the allowed network without asking for roles', async () => {
    await service.assertAllowed(call('10.2.3.4'), NetworkRestrictedAction.DoorUnlock);
    await service.assertAllowed(call('::ffff:10.2.3.4'), NetworkRestrictedAction.DoorUnlock);
    await service.assertAllowed(call('::1'), NetworkRestrictedAction.DoorUnlock);
    expect(store.actionsAllowedForUser).not.toHaveBeenCalled();
  });

  it.each(NETWORK_RESTRICTED_ACTIONS)('refuses %s from outside when no role allows it', async (action) => {
    allowedForUser = NETWORK_RESTRICTED_ACTIONS.filter((other) => other !== action);
    const error = await service.assertAllowed(call('8.8.8.8', {}, 'de'), action, 5).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkRestrictedException);
    expect((error as NetworkRestrictedException).getStatus()).toBe(403);
    expect((error as NetworkRestrictedException).getResponse()).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'NETWORK_RESTRICTED',
      code: 'NETWORK_RESTRICTED',
      action,
      description: 'Diese Aktion ist nur aus dem lokalen Netzwerk verfügbar.',
    });
  });

  it('answers in English by default', async () => {
    const error = await service.assertAllowed(call('8.8.8.8'), NetworkRestrictedAction.UsageEnd).catch((e) => e);
    expect(error.getResponse().description).toBe('This action is only available from the local network.');
  });

  it('allows from outside when one of the roles allows the action (the union of the roles)', async () => {
    allowedForUser = [NetworkRestrictedAction.UsageStart];
    await expect(service.assertAllowed(call('8.8.8.8'), NetworkRestrictedAction.UsageStart)).resolves.toBeUndefined();
    await expect(service.assertAllowed(call('8.8.8.8'), NetworkRestrictedAction.UsageTakeover)).rejects.toThrow(
      NetworkRestrictedException,
    );
  });

  it('treats an unknown address as outside', async () => {
    await expect(service.assertAllowed(call(undefined), NetworkRestrictedAction.DoorOpen)).rejects.toThrow(
      NetworkRestrictedException,
    );
  });

  it('judges by the header in header mode, not by the connection', async () => {
    config.ipSource = NetworkIpSource.Header;
    await service.assertAllowed(call('8.8.8.8', { 'x-real-ip': '10.0.0.8' }), NetworkRestrictedAction.DoorOpen);
    await expect(
      service.assertAllowed(call('10.0.0.8', { 'x-real-ip': '8.8.8.8' }), NetworkRestrictedAction.DoorOpen),
    ).rejects.toThrow(NetworkRestrictedException);
    await expect(service.assertAllowed(call('10.0.0.8'), NetworkRestrictedAction.DoorOpen)).rejects.toThrow(
      NetworkRestrictedException,
    );
  });

  describe('statusOf', () => {
    it('offers everything while off or inside', async () => {
      config.enabled = false;
      expect(await service.statusOf(call('8.8.8.8'))).toEqual({
        enabled: false,
        insideAllowedNetwork: true,
        allowedFromHere: [...NETWORK_RESTRICTED_ACTIONS],
      });
      config.enabled = true;
      expect(await service.statusOf(call('10.0.0.1'))).toEqual({
        enabled: true,
        insideAllowedNetwork: true,
        allowedFromHere: [...NETWORK_RESTRICTED_ACTIONS],
      });
    });

    it('offers the role actions from outside, without revealing the configuration', async () => {
      allowedForUser = [NetworkRestrictedAction.DoorOpen];
      const status = await service.statusOf(call('8.8.8.8'));
      expect(status).toEqual({
        enabled: true,
        insideAllowedNetwork: false,
        allowedFromHere: [NetworkRestrictedAction.DoorOpen],
      });
      expect(Object.keys(status).sort()).toEqual(['allowedFromHere', 'enabled', 'insideAllowedNetwork']);
    });
  });
});
