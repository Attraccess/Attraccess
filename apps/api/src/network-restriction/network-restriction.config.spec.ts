import { BadRequestException } from '@nestjs/common';
import { NetworkIpSource, NetworkRestrictedAction } from '@attraccess/application-models';
import { assertConsistent, parseConfigUpdate, parseRoleActionsUpdate } from './network-restriction.config';

describe('parseConfigUpdate', () => {
  it('accepts a full update and trims and de-duplicates the ranges', () => {
    expect(
      parseConfigUpdate({
        enabled: true,
        allowedRanges: [' 10.0.0.0/8', '10.0.0.0/8', 'fc00::/7', '192.168.1.5'],
        ipSource: 'header',
        headerName: ' X-Real-Ip ',
      }),
    ).toEqual({
      enabled: true,
      allowedRanges: ['10.0.0.0/8', 'fc00::/7', '192.168.1.5'],
      ipSource: NetworkIpSource.Header,
      headerName: 'X-Real-Ip',
    });
  });

  it('names the offending range in the 400', () => {
    expect(() => parseConfigUpdate({ allowedRanges: ['10.0.0.0/8', '10.0.0.0/40'] })).toThrow(
      new BadRequestException('Invalid IP address or CIDR range: "10.0.0.0/40"'),
    );
    expect(() => parseConfigUpdate({ allowedRanges: [12] })).toThrow(BadRequestException);
  });

  it.each([
    [{ enabled: 'false' }],
    [{ enabled: 1 }],
    [{ ipSource: 'forwarded' }],
    [{ headerName: 'bad header' }],
    [{ headerName: '' }],
    [{ allowedRanges: '10.0.0.0/8' }],
    [{ allowedRanges: Array.from({ length: 201 }, () => '10.0.0.1') }],
    ['text'],
    [null],
  ])('rejects %j without coercing it', (body) => {
    expect(() => parseConfigUpdate(body)).toThrow(BadRequestException);
  });

  it('returns only the given fields', () => {
    expect(parseConfigUpdate({})).toEqual({});
  });
});

describe('assertConsistent', () => {
  const base = { enabled: true, allowedRanges: [] as string[], ipSource: NetworkIpSource.Client, headerName: 'X' };
  it('rejects enabling without ranges, but allows an empty list while off', () => {
    expect(() => assertConsistent(base)).toThrow(BadRequestException);
    expect(() => assertConsistent({ ...base, enabled: false })).not.toThrow();
    expect(() => assertConsistent({ ...base, allowedRanges: ['10.0.0.0/8'] })).not.toThrow();
  });
});

describe('parseRoleActionsUpdate', () => {
  it('accepts known actions and de-duplicates them', () => {
    expect(
      parseRoleActionsUpdate({ roles: [{ roleId: 2, actions: ['usage.start', 'usage.start', 'door.open'] }] }),
    ).toEqual([{ roleId: 2, actions: [NetworkRestrictedAction.UsageStart, NetworkRestrictedAction.DoorOpen] }]);
  });

  it.each([
    [{ roles: [{ roleId: 1, actions: ['usage.fly'] }] }],
    [{ roles: [{ roleId: '1', actions: [] }] }],
    [{ roles: [{ roleId: 1.5, actions: [] }] }],
    [{ roles: [{ roleId: 1 }] }],
    [
      {
        roles: [
          { roleId: 1, actions: [] },
          { roleId: 1, actions: [] },
        ],
      },
    ],
    [{}],
  ])('rejects %j', (body) => {
    expect(() => parseRoleActionsUpdate(body)).toThrow(BadRequestException);
  });
});
