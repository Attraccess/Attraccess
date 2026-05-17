import { describe, it, expect } from 'vitest';
import { createServer } from 'node:net';
import { findFreePort, isPortFree } from './find-free-port.mts';

describe('isPortFree', () => {
  it('returns true for a port nothing is bound to', async () => {
    const free = await isPortFree(0);
    expect(free).toBe(true);
  });

  it('returns false for a port that is currently bound', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      expect(await isPortFree(port)).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('findFreePort', () => {
  it('returns the starting port when it is free', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await findFreePort(port, 10)).toBe(port);
  });

  it('skips occupied ports and returns the next free one', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '0.0.0.0', resolve));
    const blocked = (blocker.address() as { port: number }).port;
    try {
      const result = await findFreePort(blocked, 10);
      expect(result).toBeGreaterThan(blocked);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it('throws when no port is free within maxAttempts', async () => {
    const blockers: ReturnType<typeof createServer>[] = [];
    try {
      const blocker = createServer();
      await new Promise<void>((resolve) => blocker.listen(0, '0.0.0.0', resolve));
      const start = (blocker.address() as { port: number }).port;
      blockers.push(blocker);
      await expect(findFreePort(start, 1)).rejects.toThrow(/No free port/);
    } finally {
      for (const b of blockers) {
        await new Promise<void>((resolve) => b.close(() => resolve()));
      }
    }
  });
});
