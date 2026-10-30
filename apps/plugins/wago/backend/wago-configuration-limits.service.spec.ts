import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../modbus/model';
import {
  CONFIGURATION_LIMIT_CODE,
  CONFIGURATION_LIMIT_MESSAGES,
  MAX_IDENTIFIER_CHARS,
} from '../shared/configuration-limits';
import { type WagoConfigurationSnapshot, canonicalSnapshot, configurationHash } from './configuration/model';
import { fixture, rollback, snapshot } from './configuration-editor.fixture.test-utils';

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
    physicalPoints: Array.from({ length: 257 }, (_, index) => ({
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
});
