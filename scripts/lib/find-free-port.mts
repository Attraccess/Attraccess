// Pure port-probing helpers for dev-server launcher
// FEATURE: dev-server-port-isolation

import { createServer } from 'node:net';

export async function isPortFree(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

export async function findFreePort(start: number, maxAttempts = 100, host = '0.0.0.0'): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = start + i;
    if (await isPortFree(candidate, host)) return candidate;
  }
  throw new Error(`No free port found in range ${start}-${start + maxAttempts - 1}`);
}
