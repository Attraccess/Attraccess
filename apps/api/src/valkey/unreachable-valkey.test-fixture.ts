import { createServer } from 'node:net';

/** A `redis://` URL on a local port nothing listens on, so a real ioredis client fails the way an outage does. */
export async function unreachableValkeyUrl(password?: string): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `redis://${password ? `:${password}@` : ''}127.0.0.1:${port}`;
}
