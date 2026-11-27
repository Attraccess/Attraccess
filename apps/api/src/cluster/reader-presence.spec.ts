import { Logger } from '@nestjs/common';
import { ValkeyReaderPresence } from './reader-presence';
import type { ClusterBus, ClusterInstances } from './cluster.types';

describe('ValkeyReaderPresence', () => {
  afterEach(() => jest.restoreAllMocks());

  // QA finding (ATT-1163): every heartbeat during a Valkey outage logged one warning per held reader.
  it('warns once while presence cannot be written and logs once when it works again', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    let reachable = false;
    const write = jest.fn(async () => {
      if (!reachable) throw new Error('Valkey did not answer in time');
      return 1;
    });
    const client = { status: 'ready', hset: write, sadd: write } as never;
    const instances = { id: 'a', onGone: jest.fn() } as unknown as ClusterInstances;
    const bus = { on: jest.fn(), broadcast: jest.fn(async () => undefined) } as unknown as ClusterBus;
    const presence = new ValkeyReaderPresence(client, instances, bus);
    presence.socketConnected(1, 's1');
    presence.socketConnected(2, 's2');

    await presence.resync();
    await presence.resync();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Could not record reader');

    reachable = true;
    await presence.resync();
    await presence.resync();

    expect(log.mock.calls.filter(([line]) => String(line).includes('works again'))).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
