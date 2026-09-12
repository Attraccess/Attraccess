import { DiscoveryService } from './discovery.service';
import type { DeviceRegistryService } from './device-registry.service';
import type { ShellyProbeService } from './shelly-probe.service';
import { discoverViaMdns } from './mdns-discovery';

jest.mock('./mdns-discovery', () => ({ discoverViaMdns: jest.fn().mockResolvedValue([]) }));

const mdnsMock = discoverViaMdns as jest.MockedFunction<typeof discoverViaMdns>;

function makeRegistry(existing: { id: number; name: string; ipAddress: string }[] = []) {
  const rows = [...existing];
  let nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  return {
    findByIp: jest.fn(async (ip: string) => rows.find((row) => row.ipAddress === ip) ?? null),
    create: jest.fn(async (input: { name: string; ipAddress: string }) => {
      const row = { id: nextId++, name: input.name, ipAddress: input.ipAddress };
      rows.push(row);
      return row;
    }),
    updateProbe: jest.fn(async () => undefined),
    rows,
  };
}

function makeProbe(reachable: Record<string, { generation: number; model: string | null }>) {
  return {
    probe: jest.fn(async (ip: string) => {
      const hit = reachable[ip];
      if (!hit) throw new Error(`probe of http://${ip}/shelly failed: timeout`);
      return { ...hit, authState: 'none' as const, raw: {} };
    }),
  };
}

function build(registry: ReturnType<typeof makeRegistry>, probe: ReturnType<typeof makeProbe>) {
  return new DiscoveryService(registry as unknown as DeviceRegistryService, probe as unknown as ShellyProbeService);
}

describe('DiscoveryService', () => {
  beforeEach(() => mdnsMock.mockResolvedValue([]));

  it('adds every device on the scanned subnet that answers the probe', async () => {
    const registry = makeRegistry();
    const probe = makeProbe({ '192.168.9.2': { generation: 2, model: 'SNSW-001P16EU' } });

    const result = await build(registry, probe).discover('192.168.9.0/30');

    expect(result.probed).toBe(2);
    expect(result.subnets).toEqual(['192.168.9.0/30']);
    expect(result.devices).toEqual([
      expect.objectContaining({
        ipAddress: '192.168.9.2',
        generation: 2,
        model: 'SNSW-001P16EU',
        isNew: true,
        source: 'scan',
        name: 'SNSW-001P16EU (192.168.9.2)',
      }),
    ]);
    expect(registry.create).toHaveBeenCalledTimes(1);
  });

  it('refreshes an already-registered device instead of duplicating it, keeping its name', async () => {
    const registry = makeRegistry([{ id: 7, name: 'Workshop light', ipAddress: '192.168.9.1' }]);
    const probe = makeProbe({ '192.168.9.1': { generation: 1, model: 'SHSW-25' } });

    const result = await build(registry, probe).discover('192.168.9.0/30');

    expect(registry.create).not.toHaveBeenCalled();
    expect(registry.updateProbe).toHaveBeenCalledWith(7, expect.objectContaining({ model: 'SHSW-25' }));
    expect(result.devices).toEqual([expect.objectContaining({ deviceId: 7, name: 'Workshop light', isNew: false })]);
  });

  it('probes mDNS hits outside the scanned subnet, without probing an address twice', async () => {
    mdnsMock.mockResolvedValue(['10.9.9.9', '192.168.9.1']);
    const registry = makeRegistry();
    const probe = makeProbe({ '10.9.9.9': { generation: 3, model: null } });

    const result = await build(registry, probe).discover('192.168.9.0/30');

    // 2 mDNS hits + the /30's two hosts, minus the overlapping 192.168.9.1.
    expect(result.probed).toBe(3);
    expect(probe.probe.mock.calls.filter(([ip]) => ip === '192.168.9.1')).toHaveLength(1);
    expect(result.devices).toEqual([
      expect.objectContaining({ ipAddress: '10.9.9.9', source: 'mdns', name: '10.9.9.9' }),
    ]);
  });

  it('ignores mDNS replies pointing at a public address', async () => {
    mdnsMock.mockResolvedValue(['8.8.8.8', '192.168.9.1']);
    const registry = makeRegistry();
    const probe = makeProbe({ '8.8.8.8': { generation: 2, model: 'not-really-a-shelly' } });

    const result = await build(registry, probe).discover('192.168.9.0/30');

    expect(probe.probe.mock.calls.map(([ip]) => ip)).not.toContain('8.8.8.8');
    expect(result.devices).toEqual([]);
  });

  it('rejects a subnet it must not scan', async () => {
    const service = build(makeRegistry(), makeProbe({}));
    await expect(service.discover('8.8.8.0/24')).rejects.toThrow(/only private networks/);
  });
});
