import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { ValkeyClientService, VALKEY_COMMAND_TIMEOUT_MS } from './valkey.module';
import { isValkeyUnavailableError } from './valkey-unavailable';

// QA finding (ATT-1163): a Valkey that keeps the connection open but stops answering (paused container, network
// partition without a reset) made every request that needs Valkey hang, session sign-in included, and run late once
// Valkey answered again. Requests must fail with the 503 instead; subscribers must still subscribe once it is back.
describe('ValkeyClientService against a Valkey that stops answering', () => {
  let container: StartedTestContainer;
  let admin: Redis;
  let service: ValkeyClientService;

  beforeAll(async () => {
    container = await new GenericContainer('valkey/valkey:9-alpine').withExposedPorts(6379).start();
    const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    service = new ValkeyClientService({ get: () => ({ VALKEY_URL: url }) } as unknown as ConfigService);
    admin = new Redis(url);
    await service.client?.ping();
  });

  afterAll(async () => {
    await service?.onApplicationShutdown();
    admin?.disconnect();
    await container?.stop();
    jest.restoreAllMocks();
  });

  it('fails a command as unavailable after the timeout, and a subscriber still subscribes afterwards', async () => {
    const client = service.client as Redis;
    const subscriber = client.duplicate({ maxRetriesPerRequest: null, commandTimeout: undefined });
    const pauseMs = VALKEY_COMMAND_TIMEOUT_MS + 2_000;
    await admin.call('CLIENT', 'PAUSE', String(pauseMs), 'ALL');
    const startedAt = Date.now();

    const error = await client.get('anything').catch((caught: unknown) => caught);
    const subscribed = subscriber.subscribe('channel');

    expect(isValkeyUnavailableError(error)).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(pauseMs);
    await expect(subscribed).resolves.toBe(1);
    subscriber.disconnect();
  }, 30_000);
});
