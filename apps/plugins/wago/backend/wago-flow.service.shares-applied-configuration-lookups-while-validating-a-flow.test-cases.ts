import type { WagoFlowServiceTestScope } from './wago-flow.service.spec';
import { WagoSettings } from './wago-settings.entity';

export function registerSharesAppliedConfigurationLookupsWhileValidatingAFlow(scope: WagoFlowServiceTestScope): void {
  it('shares applied configuration lookups while validating a flow', async () => {
    const { service, revisionRepository } = scope.createService();
    const config = { controllerId: 1, channelId: 'door', category: 'state', equals: false };
    const context = new Map<string, unknown>();
    await Promise.all([
      service.validateConfig(config, 'event', context),
      service.validateConfig(config, 'read', context),
      service.validateConfig(config, 'wait', context),
    ]);
    expect(revisionRepository.find).toHaveBeenCalledTimes(1);
  });
}

export function registerStartsWithAnUnavailableMqttBrokerAndRetriesFlowSubscriptions(
  scope: WagoFlowServiceTestScope,
): void {
  it('starts with an unavailable MQTT broker and retries flow subscriptions', async () => {
    const { service, context } = scope.createService();
    const subscribe = context.mqtt.subscribe as jest.Mock;
    subscribe.mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(context.logger.warn).toHaveBeenCalledWith(expect.stringContaining('broker unavailable'));

    await jest.advanceTimersByTimeAsync(60_000);
    expect(subscribe).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });
}

export function registerStillFailsStartupWhenFlowSettingsCannotBeRead(scope: WagoFlowServiceTestScope): void {
  it('still fails startup when flow settings cannot be read', async () => {
    const { service, context } = scope.createService();
    const settings = context.getRepository(WagoSettings) as unknown as { findOneBy: jest.Mock };
    settings.findOneBy.mockRejectedValueOnce(new Error('settings unavailable'));

    await expect(service.onModuleInit()).rejects.toThrow('settings unavailable');
  });
}

export function registerUsesCurrentAppliedChannelNamesInTheFormEvenWhenTheRuntimeCacheIsPopulated(
  scope: WagoFlowServiceTestScope,
): void {
  it('uses current applied channel names in the form even when the runtime cache is populated', async () => {
    const { service, revisionRepository } = scope.createService();
    await service.refresh();
    revisionRepository.find.mockResolvedValue([
      {
        ...scope.revision,
        snapshot: JSON.stringify({ logicalChannels: [{ id: 'new-input', capabilities: ['input'] }] }),
        presetProvenance: JSON.stringify({ editor: { names: { 'new-input': 'Door contact' } } }),
      },
    ]);
    await expect(
      service.resolveConfigSchema({ controllerId: 1, channelId: 'new-input' }, 'event'),
    ).resolves.toMatchObject({
      properties: { channelId: { oneOf: [{ const: 'new-input', title: 'Door contact' }] } },
    });
  });
}

export function registerUsesSourceTimestampsForStaleStateAndReturnsNodeSpecificSchemas(
  scope: WagoFlowServiceTestScope,
): void {
  it('uses source timestamps for stale state and returns node-specific schemas', async () => {
    const { service } = scope.createService();
    await service.refresh();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    await service['onMessage'](
      2,
      'attraccess/wago',
      topic,
      Buffer.from(
        JSON.stringify({
          streamId: scope.STREAM_A,
          sequence: 1,
          timestamp: new Date(Date.now() - 90_001).toISOString(),
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs: { door: true },
        }),
      ),
    );
    const state = service.read({ controllerId: 1, channelId: 'door', category: 'state' });
    expect(state && service.payload(state)).toMatchObject({ stale: true });
    const eventSchema = await service.resolveConfigSchema({ controllerId: 1, channelId: 'door' }, 'event');
    const waitSchema = await service.resolveConfigSchema(
      { controllerId: 1, channelId: 'door', category: 'state' },
      'wait',
    );
    expect(eventSchema).toMatchObject({
      required: ['controllerId', 'channelId', 'category'],
      properties: { minimumIntervalMs: expect.any(Object) },
    });
    expect(waitSchema).toMatchObject({ properties: { equals: { type: 'boolean' }, timeoutMs: expect.any(Object) } });
    expect((waitSchema.properties as Record<string, { maximum: number }>).timeoutMs.maximum).toBe(2_147_483_647);
  });
}

export function registerValidatesAppliedChannelsForSNodes(scope: WagoFlowServiceTestScope): void {
  it.each(['event', 'read', 'wait'] as const)('validates applied channels for %s nodes', async (kind) => {
    const { service } = scope.createService();
    const config = { controllerId: 1, channelId: 'door', category: 'state', equals: false };
    await expect(service.validateConfig(config, kind)).resolves.toEqual([]);
    await expect(service.validateConfig({ ...config, channelId: 'removed' }, kind)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'channelId' })]),
    );
    await expect(service.validateConfig({ ...config, category: 'measurement' }, kind)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'category' })]),
    );
  });
}
