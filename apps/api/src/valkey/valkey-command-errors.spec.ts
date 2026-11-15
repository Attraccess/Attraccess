import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';
import { inspect } from 'node:util';
import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { ValkeyClientService } from './valkey.module';

const PASSWORD = 'secret-password';

// Answers every command with WRONGPASS, like Valkey does for AUTH with a wrong password, until it accepts the password.
async function startWrongPassServer(): Promise<{
  port: number;
  acceptPassword: () => void;
  stop: () => Promise<void>;
}> {
  const sockets = new Set<Socket>();
  let reply = '-WRONGPASS invalid username-password pair or user is disabled.\r\n';
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (data) => {
      const commands = data.toString().match(/(?:^|\r\n)\*\d+\r\n/g)?.length ?? 0;
      socket.write(reply.repeat(commands));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    port: typeof address === 'object' && address ? address.port : 0,
    acceptPassword: () => {
      reply = '+OK\r\n';
    },
    stop: async () => {
      sockets.forEach((socket) => socket.destroy());
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// Disconnecting while AUTH is pending or a reconnect is scheduled leaves ioredis' stream timeout running, so wait
// until the client is ready.
async function disconnect(client: Redis): Promise<void> {
  if (client.status !== 'ready') {
    await once(client, 'ready');
  }
  const ended = once(client, 'end');
  client.disconnect();
  await ended;
}

describe('redactValkeyCommandErrors', () => {
  let server: Awaited<ReturnType<typeof startWrongPassServer>>;
  let service: ValkeyClientService;
  let client: Redis;

  beforeEach(async () => {
    server = await startWrongPassServer();
    jest.spyOn(ConsoleLogger.prototype, 'warn').mockImplementation();
    jest.spyOn(ConsoleLogger.prototype, 'log').mockImplementation();
    service = new ValkeyClientService({
      get: () => ({ VALKEY_URL: `redis://default:${PASSWORD}@127.0.0.1:${server.port}` }),
    } as unknown as ConfigService);
    client = service.client as Redis;
  });

  afterEach(async () => {
    server.acceptPassword();
    await disconnect(client);
    await server.stop();
    jest.restoreAllMocks();
  });

  const expectNoPassword = (error: unknown) => {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('WRONGPASS');
    expect(error).not.toHaveProperty('command');
    expect(inspect(error, { showHidden: true, depth: null })).not.toContain(PASSWORD);
    expect(JSON.stringify(error)).not.toContain(PASSWORD);
  };

  it('rejects commands with the AUTH error but without the password', async () => {
    const errors = await Promise.all([
      client.get('key').catch((error) => error),
      client.publish('channel', 'message').catch((error) => error),
      client.eval('return 1', 0).catch((error) => error),
    ]);

    errors.forEach(expectNoPassword);
  });

  it('keeps the password out of transactions and duplicated clients', async () => {
    const results = await client
      .multi()
      .incr('key')
      .exec()
      .catch((error) => error);
    const duplicate = client.duplicate().on('error', () => undefined);
    const duplicateError = await duplicate.get('key').catch((error) => error);
    server.acceptPassword();
    await disconnect(duplicate);

    expect(inspect(results, { showHidden: true, depth: null })).toContain('WRONGPASS');
    expect(inspect(results, { showHidden: true, depth: null })).not.toContain(PASSWORD);
    expectNoPassword(duplicateError);
  });

  it('keeps the password out of what the Nest logger prints for the error', async () => {
    const error = await client.get('key').catch((caught) => caught);
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    new ConsoleLogger('Test').error(error);
    new ConsoleLogger('Test').error('Request failed', error);

    const printed = [...write.mock.calls, ...stdout.mock.calls].map(([chunk]) => String(chunk)).join('');
    expect(printed).toContain('WRONGPASS');
    expect(printed).not.toContain(PASSWORD);
  });
});
