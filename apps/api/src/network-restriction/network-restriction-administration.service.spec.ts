import { BadRequestException } from '@nestjs/common';
import { NetworkIpSource, NetworkRestrictedAction } from '@attraccess/application-models';
import type { AuditActor, AuditRecorder } from '../audit/recorder/audit-event';
import { NetworkRestrictionAdministrationService } from './network-restriction-administration.service';
import { NetworkRestrictionConfigService } from './network-restriction-config.service';
import { NetworkRestrictionService } from './network-restriction.service';
import type { NetworkRestrictionConfig } from './network-restriction.config';
import type { NetworkRestrictionStore, RoleNetworkActionsRecord } from './network-restriction.port';

const actor: AuditActor = { id: 1, authenticationMethod: 'session' };

describe('NetworkRestrictionAdministrationService', () => {
  let config: NetworkRestrictionConfig;
  let roles: Array<RoleNetworkActionsRecord & { key: string; name: string }>;
  const record = jest.fn();
  const replaceRoleActions = jest.fn();
  let service: NetworkRestrictionAdministrationService;

  beforeEach(() => {
    config = { enabled: false, allowedRanges: [], ipSource: NetworkIpSource.Client, headerName: 'X-Real-Ip' };
    roles = [
      { roleId: 1, key: 'user', name: 'User', actions: [] },
      { roleId: 2, key: 'qa-outside', name: 'QA Outside', actions: [NetworkRestrictedAction.DoorOpen] },
    ];
    record.mockReset();
    replaceRoleActions.mockReset().mockResolvedValue(undefined);
    const store = {
      listRoleActions: jest.fn(async () => roles),
      existingRoleIds: jest.fn(async (ids: number[]) => ids.filter((id) => roles.some((role) => role.roleId === id))),
      replaceRoleActions,
    } as unknown as NetworkRestrictionStore;
    const configService = new NetworkRestrictionConfigService({} as never);
    jest.spyOn(configService, 'get').mockImplementation(async () => config);
    jest.spyOn(configService, 'update').mockImplementation(async (body) => {
      config = { ...config, ...(body as Partial<NetworkRestrictionConfig>) };
      return config;
    });
    const restriction = new NetworkRestrictionService(configService, store);
    service = new NetworkRestrictionAdministrationService(configService, restriction, store, {
      record,
    } as unknown as AuditRecorder);
  });

  it('lists every action and the roles with what they allow', async () => {
    const matrix = await service.roleMatrix();
    expect(matrix.actions).toContain(NetworkRestrictedAction.UsageTakeover);
    expect(matrix.roles).toEqual(roles);
  });

  it('refuses an unknown role before anything is replaced or audited', async () => {
    await expect(service.updateRoleMatrix({ roles: [{ roleId: 99, actions: [] }] }, actor)).rejects.toThrow(
      BadRequestException,
    );
    expect(replaceRoleActions).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('reports a role deleted during the write as an unknown role, not as a server error', async () => {
    replaceRoleActions.mockRejectedValue(Object.assign(new Error('fk'), { driverError: { code: '23503' } }));
    await expect(service.updateRoleMatrix({ roles: [{ roleId: 1, actions: ['door.open'] }] }, actor)).rejects.toThrow(
      BadRequestException,
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('lets any other write failure through', async () => {
    const failure = new Error('connection lost');
    replaceRoleActions.mockRejectedValue(failure);
    await expect(service.updateRoleMatrix({ roles: [{ roleId: 1, actions: [] }] }, actor)).rejects.toBe(failure);
  });

  it('replaces the given roles and audits only those whose action set changed', async () => {
    await service.updateRoleMatrix(
      {
        roles: [
          { roleId: 1, actions: ['usage.start', 'door.open'] },
          { roleId: 2, actions: ['door.open'] },
        ],
      },
      actor,
    );
    expect(replaceRoleActions).toHaveBeenCalledWith([
      { roleId: 1, actions: ['usage.start', 'door.open'] },
      { roleId: 2, actions: ['door.open'] },
    ]);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.updated',
        actor,
        details: {
          settingKey: 'networkRestriction.roleActions',
          before: 'user: ',
          after: 'user: door.open,usage.start',
        },
      }),
    );
  });

  it('clips a very long audit value to 256 characters', async () => {
    roles = [{ roleId: 3, key: 'k'.repeat(300), name: 'Long', actions: [] }];
    await service.updateRoleMatrix({ roles: [{ roleId: 3, actions: ['usage.start'] }] }, actor);
    const details = record.mock.calls[0][0].details as { after: string };
    expect(details.after).toHaveLength(256);
    expect(details.after.endsWith('…')).toBe(true);
  });

  it('audits each changed setting once and reports the detected address', async () => {
    const result = await service.updateSettings({ enabled: true, allowedRanges: ['10.0.0.0/8'] }, actor, {
      ip: '10.1.1.1',
      headers: {},
    });
    expect(record.mock.calls.map(([event]) => event.details.settingKey)).toEqual([
      'networkRestriction.enabled',
      'networkRestriction.allowedRanges',
    ]);
    expect(result).toMatchObject({ enabled: true, detectedAddress: '10.1.1.1', detectedInside: true });
  });

  it('audits a change to a long range list as what was removed and added, so nothing is cut off', async () => {
    const long = Array.from({ length: 30 }, (_, index) => `10.${index}.0.0/16`);
    config = { ...config, allowedRanges: long };
    await service.updateSettings({ allowedRanges: [...long.slice(1), '0.0.0.0/0'] }, actor, { headers: {} });
    expect(record.mock.calls[0][0].details).toEqual({
      settingKey: 'networkRestriction.allowedRanges',
      before: 'removed: 10.0.0.0/16',
      after: 'added: 0.0.0.0/0',
    });
  });
});
