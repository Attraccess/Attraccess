import { ConfigService } from '@nestjs/config';
import { hostname } from 'node:os';
import { ClusterService } from './cluster.service';

describe('ClusterService instance id', () => {
  const config = (name?: string) => ({ get: () => ({ ATTRACCESS_INSTANCE_NAME: name }) }) as unknown as ConfigService;

  // The cluster heartbeat and the session-change locks (ATT-1199) name an instance the same way.
  it('uses ATTRACCESS_INSTANCE_NAME, unique per boot', () => {
    const first = new ClusterService(null, undefined, config(' lab-a ')).instances.id;
    const second = new ClusterService(null, undefined, config('lab-a')).instances.id;

    expect(first).toMatch(/^lab-a\|[0-9a-f-]{36}$/);
    expect(second).not.toBe(first);
  });

  it('falls back to <hostname>:<PORT>', () => {
    expect(new ClusterService(null, undefined, config('  ')).instances.id.startsWith(`${hostname()}:`)).toBe(true);
    expect(new ClusterService(null).instances.id.startsWith(`${hostname()}:`)).toBe(true);
  });
});
