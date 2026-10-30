import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../modbus/model';
import {
  CONFIGURATION_LIMIT_CODE,
  CONFIGURATION_LIMIT_MESSAGES,
  MAX_CONFIGURATION_ITEMS,
  MAX_ENABLED_CHANNELS,
  MAX_IDENTIFIER_CHARS,
  configurationLimitViolations,
} from '../shared/configuration-limits';
import { meterFleet } from '../shared/configuration-limits.test-utils';
import { type WagoConfigurationSnapshot, canonicalSnapshot, configurationHash } from './configuration/model';
import { fixture, rollback, snapshot } from './configuration-editor.fixture.test-utils';
import {
  CHANNEL_ENABLED_UNSUPPORTED_CODE,
  CHANNEL_ENABLED_UNSUPPORTED_MESSAGE,
  LEGACY_RUNTIME_LIMIT_MESSAGES,
  legacyRuntimeLimitErrors,
  runtimeSupportErrors,
} from './configuration/channel-enabled';
import { FIXTURE_CAPABILITIES } from './configuration-editor.fixture.test-utils';

describe('configuration editor service limits', () => {
  it('reports the configuration limits an older revision breaks in its rollback preview', async () => {
    const { service, revisions } = fixture();
    await service.saveDraft(1, snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    expect((await service.previewRevision(1, 1)).errors).toEqual([]);
    const historical = {
      ...snapshot,
      logicalChannels: [{ ...snapshot.logicalChannels[0], id: 'x'.repeat(MAX_IDENTIFIER_CHARS + 1) }],
    };
    revisions[0].snapshot = canonicalSnapshot(historical);
    revisions[0].contentHash = configurationHash(historical);
    expect((await service.previewRevision(1, 1)).errors).toEqual([
      {
        path: '$.logicalChannels[0].id',
        code: CONFIGURATION_LIMIT_CODE,
        message: CONFIGURATION_LIMIT_MESSAGES.identifierLength,
      },
    ]);
  });

  const tooManyChannels: WagoConfigurationSnapshot = {
    ...snapshot,
    physicalPoints: Array.from({ length: MAX_CONFIGURATION_ITEMS + 1 }, (_, index) => ({
      id: `point-${index}`,
      hardwareProfile: '751-9301' as const,
      channel: 0,
    })),
  };

  it('refuses to publish a configuration over the limits and publishes nothing', async () => {
    const { service, mqtt } = fixture();
    await service.saveDraft(1, tooManyChannels);
    await service.reviewDraft(1);
    await expect(service.publishDraft(1)).rejects.toMatchObject({
      response: { errors: [expect.objectContaining({ code: 'configuration_limit_exceeded' })] },
    });
    expect(mqtt.publish).not.toHaveBeenCalled();
  });

  it('refuses a rollback to a stored revision that is over the limits', async () => {
    const { service, revisions, mqtt } = fixture();
    await service.saveDraft(1, snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    revisions.push({
      ...revisions[0],
      id: 99,
      revision: 2,
      snapshot: JSON.stringify(tooManyChannels),
      contentHash: configurationHash(tooManyChannels),
    });
    mqtt.publish.mockClear();
    await expect(service.previewRevision(1, 2).then(() => rollback(service, 2, true))).rejects.toMatchObject({
      response: { errors: [expect.objectContaining({ code: 'configuration_limit_exceeded' })] },
    });
    expect(mqtt.publish).not.toHaveBeenCalled();
  });

  it('still publishes a copied meter profile', async () => {
    const { service, mqtt } = fixture();
    const profile = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'copied-meter');
    await service.saveDraft(1, { ...snapshot, modbus: { connections: [], devices: [], profiles: [profile] } });
    await service.reviewDraft(1);
    await service.publishDraft(1);
    expect(mqtt.publish).toHaveBeenCalledTimes(1);
  });

  it('publishes ten built-in 879-3020 meters with 131 channels each and 11 enabled', async () => {
    const { service, mqtt } = fixture();
    const fleet = meterFleet(10, 11) as WagoConfigurationSnapshot;
    expect(fleet.logicalChannels).toHaveLength(1310);
    await service.saveDraft(1, fleet);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    expect(mqtt.publish).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['257 enabled channels', meterFleet(2, 128) as WagoConfigurationSnapshot, 'enabled-channels'],
    ['2049 channels, most of them disabled', meterFleet(16, 11) as WagoConfigurationSnapshot, 'channels'],
  ])('refuses %s with its own limit message', async (_name, value, limit) => {
    if (limit === 'enabled-channels') value.logicalChannels.push({ ...value.logicalChannels[0], id: 'one-more' });
    expect(configurationLimitViolations(value).map((violation) => violation.limit)).toEqual(
      limit === 'channels' ? ['points', 'channels'] : [limit],
    );
    const { service, mqtt } = fixture();
    await service.saveDraft(1, value);
    await service.reviewDraft(1);
    const message =
      limit === 'channels' ? CONFIGURATION_LIMIT_MESSAGES.channels : CONFIGURATION_LIMIT_MESSAGES.enabledChannels;
    await expect(service.publishDraft(1)).rejects.toMatchObject({
      response: { errors: expect.arrayContaining([{ path: '$', code: CONFIGURATION_LIMIT_CODE, message }]) },
    });
    expect(mqtt.publish).not.toHaveBeenCalled();
    expect(MAX_ENABLED_CHANNELS).toBe(256);
  });

  describe('disabled channels and the runtime capability', () => {
    const olderRuntime = ['claim', 'heartbeat', 'configuration-v1'];
    const refusal = {
      status: 409,
      response: {
        code: CHANNEL_ENABLED_UNSUPPORTED_CODE,
        message: CHANNEL_ENABLED_UNSUPPORTED_MESSAGE,
        errors: [{ path: '$', code: CHANNEL_ENABLED_UNSUPPORTED_CODE, message: CHANNEL_ENABLED_UNSUPPORTED_MESSAGE }],
      },
    };

    it('refuses to publish disabled channels to a runtime without channel-enabled-v1 and stores nothing', async () => {
      const { service, mqtt, revisions } = fixture({ capabilities: olderRuntime });
      await service.saveDraft(1, meterFleet(1, 11));
      await service.reviewDraft(1);
      await expect(service.publishDraft(1)).rejects.toMatchObject(refusal);
      expect(mqtt.publish).not.toHaveBeenCalled();
      expect(revisions).toHaveLength(0);
    });

    it('still publishes a configuration without disabled channels to an older runtime', async () => {
      const { service, mqtt } = fixture({ capabilities: olderRuntime });
      await service.saveDraft(1, meterFleet(1, 131));
      await service.reviewDraft(1);
      await service.publishDraft(1);
      expect(mqtt.publish).toHaveBeenCalledTimes(1);
      const published = JSON.parse(String(mqtt.publish.mock.calls[0][2]));
      expect(published.snapshot.logicalChannels.some((channel: { enabled?: false }) => 'enabled' in channel)).toBe(
        false,
      );
    });

    it('publishes disabled channels unchanged, with a matching content hash, to a capable runtime', async () => {
      const { service, mqtt } = fixture();
      const fleet = meterFleet(2, 11);
      await service.saveDraft(1, fleet);
      await service.reviewDraft(1);
      await service.publishDraft(1);
      const published = JSON.parse(String(mqtt.publish.mock.calls[0][2]));
      expect(published.snapshot.logicalChannels).toHaveLength(262);
      expect(published.contentHash).toBe(configurationHash(published.snapshot));
      expect(published.contentHash).toBe(configurationHash(fleet));
    });

    function withStoredDisabledRevision(capabilities?: string[]) {
      const setup = fixture(capabilities ? { capabilities } : {});
      return {
        ...setup,
        async prepare() {
          await setup.service.saveDraft(1, snapshot);
          await setup.service.reviewDraft(1);
          await setup.service.publishDraft(1);
          const disabled = meterFleet(1, 11);
          setup.revisions.push({
            ...setup.revisions[0],
            id: 99,
            revision: 2,
            snapshot: canonicalSnapshot(disabled),
            contentHash: configurationHash(disabled),
          });
          setup.mqtt.publish.mockClear();
        },
      };
    }

    it('refuses a rollback to a stored revision with disabled channels and reports it in the preview', async () => {
      const { service, mqtt, prepare } = withStoredDisabledRevision(olderRuntime);
      await prepare();
      expect((await service.previewRevision(1, 2)).errors).toEqual(refusal.response.errors);
      await expect(rollback(service, 2, true)).rejects.toMatchObject(refusal);
      expect(mqtt.publish).not.toHaveBeenCalled();
    });

    it('rolls back to a stored all-enabled revision from a runtime without the capability', async () => {
      const { service, mqtt, prepare } = withStoredDisabledRevision(olderRuntime);
      await prepare();
      expect((await service.previewRevision(1, 1)).errors).toEqual([]);
      await rollback(service, 1, true);
      expect(mqtt.publish).toHaveBeenCalledTimes(1);
    });

    it('rolls back to a stored revision with disabled channels on a capable runtime', async () => {
      const { service, mqtt, prepare } = withStoredDisabledRevision();
      await prepare();
      expect((await service.previewRevision(1, 2)).errors).toEqual([]);
      await rollback(service, 2, true);
      expect(mqtt.publish).toHaveBeenCalledTimes(1);
    });

    it('refuses at publication when the controller lost the capability after the draft was checked', async () => {
      const { service, mqtt } = fixture();
      const controller = await (
        service as unknown as { controllers: { findOneBy: () => Promise<{ capabilities: string }> } }
      ).controllers.findOneBy();
      const revision = {
        controllerId: 1,
        revision: 1,
        snapshot: canonicalSnapshot(meterFleet(1, 11)),
        contentHash: configurationHash(meterFleet(1, 11)),
        state: 'pending',
      };
      const publishRevision = Reflect.get(service, 'publishRevision').bind(service) as (
        controller: unknown,
        revision: unknown,
      ) => Promise<unknown>;
      await expect(
        publishRevision({ ...controller, capabilities: JSON.stringify(olderRuntime) }, revision),
      ).rejects.toMatchObject(refusal);
      expect(mqtt.publish).not.toHaveBeenCalled();
      await publishRevision(controller, revision);
      expect(mqtt.publish).toHaveBeenCalledTimes(1);
    });
  });
  describe('older runtime limits', () => {
    const olderRuntime = ['claim', 'heartbeat', 'configuration-v1'];
    /** All enabled and within the current limits, but 262 physical points: one meter's channels only. */
    function manyPoints(): WagoConfigurationSnapshot {
      const fleet = meterFleet(2, 131) as WagoConfigurationSnapshot;
      return { ...fleet, logicalChannels: fleet.logicalChannels.slice(0, 131) };
    }
    const pointsError = { path: '$', code: CONFIGURATION_LIMIT_CODE, message: LEGACY_RUNTIME_LIMIT_MESSAGES.points };

    it('accepts the snapshot under the current limits', () => {
      expect(configurationLimitViolations(manyPoints())).toEqual([]);
    });

    it('refuses to publish more than 256 points to an older runtime and publishes nothing', async () => {
      const { service, mqtt, revisions } = fixture({ capabilities: olderRuntime });
      await service.saveDraft(1, manyPoints());
      await service.reviewDraft(1);
      await expect(service.publishDraft(1)).rejects.toMatchObject({
        status: 409,
        response: { code: CONFIGURATION_LIMIT_CODE, message: pointsError.message, errors: [pointsError] },
      });
      expect(mqtt.publish).not.toHaveBeenCalled();
      expect(revisions).toHaveLength(0);
    });

    it('publishes the same snapshot to a current runtime', async () => {
      const { service, mqtt } = fixture();
      await service.saveDraft(1, manyPoints());
      await service.reviewDraft(1);
      await service.publishDraft(1);
      expect(mqtt.publish).toHaveBeenCalledTimes(1);
    });

    it('reports the older limit in the rollback preview and refuses the rollback', async () => {
      const { service, mqtt, revisions } = fixture({ capabilities: olderRuntime });
      await service.saveDraft(1, snapshot);
      await service.reviewDraft(1);
      await service.publishDraft(1);
      const stored = manyPoints();
      revisions.push({
        ...revisions[0],
        id: 99,
        revision: 2,
        snapshot: canonicalSnapshot(stored),
        contentHash: configurationHash(stored),
      });
      mqtt.publish.mockClear();
      expect((await service.previewRevision(1, 2)).errors).toEqual([pointsError]);
      await expect(rollback(service, 2, true)).rejects.toMatchObject({ response: { errors: [pointsError] } });
      expect(mqtt.publish).not.toHaveBeenCalled();
    });

    it('applies the 256-channel limit and the older status report estimate only without the capability', () => {
      // Modbus measurement channels never appear in the current status report estimate, but did in the older one.
      const fleet = meterFleet(1, 131);
      const longIds = {
        ...fleet,
        logicalChannels: fleet.logicalChannels.map((channel, index) => ({
          ...channel,
          id: `${index}-${'x'.repeat(200)}`,
        })),
      };
      expect(configurationLimitViolations(longIds)).toEqual([]);
      expect(legacyRuntimeLimitErrors(longIds, olderRuntime)).toEqual([
        { path: '$', code: CONFIGURATION_LIMIT_CODE, message: LEGACY_RUNTIME_LIMIT_MESSAGES.statusReport },
      ]);
      const channels = { ...snapshot, logicalChannels: Array.from({ length: 257 }, () => snapshot.logicalChannels[0]) };
      expect(legacyRuntimeLimitErrors(channels, JSON.stringify(olderRuntime))).toEqual([
        { path: '$', code: CONFIGURATION_LIMIT_CODE, message: LEGACY_RUNTIME_LIMIT_MESSAGES.channels },
      ]);
      expect(legacyRuntimeLimitErrors(longIds, FIXTURE_CAPABILITIES)).toEqual([]);
      expect(legacyRuntimeLimitErrors(channels, JSON.stringify(FIXTURE_CAPABILITIES))).toEqual([]);
      expect(legacyRuntimeLimitErrors(meterFleet(1, 131), olderRuntime)).toEqual([]);
    });

    it('reports both the disabled channels and the older limits a snapshot breaks', () => {
      expect(runtimeSupportErrors(meterFleet(2, 11), olderRuntime).map((error) => error.code)).toEqual([
        CHANNEL_ENABLED_UNSUPPORTED_CODE,
        CONFIGURATION_LIMIT_CODE,
        CONFIGURATION_LIMIT_CODE,
      ]);
    });
  });
});
