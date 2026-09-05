import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { canonicalSnapshot, configurationHash, type WagoConfigurationSnapshot } from './configuration';
import type { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import type { WagoConfigurationRevision } from './wago-configuration-revision.entity';

describe('configuration editor service boundaries', () => {
  const snapshot: WagoConfigurationSnapshot = {
    version: 1,
    physicalPoints: [{ id: 'point', hardwareProfile: '751-9301', channel: 0 }],
    logicalChannels: [
      {
        id: 'output',
        physicalPointId: 'point',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'immediate' },
      },
    ],
  };
  function fixture() {
    let draft: WagoConfigurationDraft | null = null;
    const revisions: WagoConfigurationRevision[] = [];
    const drafts = {
      findOneBy: jest.fn(async () => (draft ? { ...draft } : null)),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        draft = { ...value };
        return draft;
      }),
    };
    const revisionRepository = {
      find: jest.fn(async () => [...revisions].sort((a, b) => b.revision - a.revision)),
      findOneBy: jest.fn(async ({ revision }) => revisions.find((item) => item.revision === revision) ?? null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        const index = revisions.findIndex((item) => item.revision === value.revision);
        if (index === -1) revisions.push({ ...value });
        else revisions[index] = { ...value };
        return value;
      }),
    };
    const mqtt = {
      publish: jest.fn<ReturnType<PluginContext['mqtt']['publish']>, Parameters<PluginContext['mqtt']['publish']>>(
        async () => undefined,
      ),
    };
    const flowQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const service = new WagoService({
      mqtt,
      dataSource: { getRepository: () => ({ createQueryBuilder: () => flowQuery }) },
    } as unknown as PluginContext);
    Object.assign(service, {
      controllers: {
        findOneBy: jest.fn(async () => ({
          id: 1,
          hardwareId: 'local-test',
          trustState: 'claimed',
          mqttServerId: 1,
          protocolVersion: '1.0.0',
          capabilities: '["claim","heartbeat","configuration-v1"]',
        })),
      },
      drafts,
      revisions: revisionRepository,
    });
    jest
      .spyOn(service, 'getSettings')
      .mockResolvedValue({ id: 1, defaultMqttServerId: 1, operationalPrefix: 'test/wago' });
    return { service, drafts, mqtt, revisions, flowQuery, draft: () => draft };
  }

  async function rollback(service: WagoService, revision: number, force = false) {
    const preview = await service.previewRevision(1, revision);
    return service.rollback(
      1,
      revision,
      force,
      preview.revision.contentHash,
      preview.current?.contentHash ?? null,
      preview.draftHash,
    );
  }

  it('previews and applies local presets without saving or publishing', async () => {
    const { service, drafts, mqtt } = fixture();
    const application = { presetId: 'pulsed-lock-bank' as const, channelId: 'output', physicalPointId: 'point' };
    const preview = await service.previewPreset(1, application, snapshot);
    const result = await service.applyPreset(
      1,
      application,
      preview.diff.map((change) => change.path),
      preview.draftHash,
      snapshot,
    );
    expect(JSON.parse(result.snapshot).logicalChannels[0].pulse.durationMs).toBe(500);
    expect(drafts.save).not.toHaveBeenCalled();
    expect(mqtt.publish).not.toHaveBeenCalled();
  });

  it('persists names only on explicit save and never includes them in published snapshots', async () => {
    const { service, mqtt, draft } = fixture();
    const metadata = { names: { output: 'Machine enable' }, presets: [] };
    await service.saveDraft(1, snapshot, metadata);
    expect(JSON.parse(draft()?.presetProvenance ?? 'null')?.editor).toEqual(metadata);
    expect(draft()?.snapshot).toBe(canonicalSnapshot(snapshot));
    await expect(service.publishDraft(1)).rejects.toThrow('review');
    await service.reviewDraft(1);
    await service.publishDraft(1);
    expect(JSON.parse(String(mqtt.publish.mock.calls[0][2])).snapshot).toEqual(snapshot);
    expect(mqtt.publish.mock.calls[0][2]).not.toContain('Machine enable');
  });

  it('includes editor metadata changes in reviews and rollback previews', async () => {
    const { service } = fixture();
    await service.saveDraft(1, snapshot, { names: { output: 'Original' }, presets: [] });
    await service.reviewDraft(1);
    await service.publishDraft(1);
    await service.saveDraft(1, snapshot, { names: { output: 'Renamed' }, presets: [] });
    const review = await service.reviewDraft(1);

    expect(review.changed).toBe(true);
    expect(review.diff).toEqual([]);
    expect(review.metadataDiff).toEqual([{ path: '$.names.output', previous: 'Original', current: 'Renamed' }]);

    await service.publishDraft(1);
    const preview = await service.previewRevision(1, 1);
    expect(preview.diff).toEqual([]);
    expect(preview.metadataDiff).toEqual([{ path: '$.names.output', previous: 'Renamed', current: 'Original' }]);
  });

  it('restores historical names and preset provenance with a rollback', async () => {
    const { service, draft } = fixture();
    const metadata = { names: { output: 'Workshop light', point: 'Cabinet output' }, presets: [] };
    await service.saveDraft(1, snapshot, metadata);
    await service.reviewDraft(1);
    const original = await service.publishDraft(1);
    expect(JSON.parse(original.presetProvenance ?? 'null').editor).toEqual(metadata);
    await service.saveDraft(1, { ...snapshot, logicalChannels: [] }, { names: {}, presets: [] });
    await service.reviewDraft(1);
    await service.publishDraft(1, true);
    const restored = await rollback(service, 1, true);
    expect(restored.presetProvenance).toBe(original.presetProvenance);
    expect(draft()?.presetProvenance).toBe(original.presetProvenance);
  });

  it('requires force acknowledgement for impacts and creates rollback as a new immutable revision', async () => {
    const { service, revisions, mqtt, flowQuery } = fixture();
    await service.saveDraft(1, snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    const original = { ...revisions[0] };
    flowQuery.getMany.mockResolvedValue([
      { id: 'command-1', resourceId: 2, type: 'plugin.wago.command', data: { controllerId: 1, channelId: 'output' } },
    ]);
    const changed = { ...snapshot, logicalChannels: [] };
    await service.saveDraft(1, changed);
    expect((await service.reviewDraft(1)).impacts).toEqual([
      expect.objectContaining({
        channelId: 'output',
        references: [{ nodeId: 'command-1', resourceId: 2, nodeType: 'plugin.wago.command' }],
      }),
    ]);
    await expect(service.publishDraft(1)).rejects.toThrow('acknowledge');
    expect(mqtt.publish).toHaveBeenCalledTimes(1);
    await service.publishDraft(1, true);
    const preview = await service.previewRevision(1, 1);
    expect(preview.revision.revision).toBe(1);
    expect(revisions).toHaveLength(2);
    const restored = await rollback(service, 1, true);
    expect(restored.revision).toBe(3);
    expect(restored.contentHash).toBe(configurationHash(snapshot));
    expect(revisions[0]).toEqual(original);
  });

  it('does not overwrite the draft when a rollback requires acknowledgement', async () => {
    const { service, draft } = fixture();
    await service.saveDraft(1, { ...snapshot, logicalChannels: [] });
    await service.reviewDraft(1);
    await service.publishDraft(1);
    await service.saveDraft(1, snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    const before = { ...draft() };
    await expect(rollback(service, 1)).rejects.toThrow('acknowledge');
    expect(draft()).toEqual(before);
  });

  it('returns field validation errors for local edits without changing the saved draft', async () => {
    const { service, drafts } = fixture();
    const result = await service.validateDraft(1, { ...snapshot, physicalPoints: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ path: 'logicalChannels[0].physicalPointId' }));
    expect(drafts.save).not.toHaveBeenCalled();
  });

  it('rejects publishing another editor’s reviewed draft with a stale review hash', async () => {
    const { service, mqtt } = fixture();
    await service.saveDraft(1, snapshot);
    const review = await service.reviewDraft(1);
    await service.saveDraft(1, { ...snapshot, logicalChannels: [] });
    await service.reviewDraft(1);
    expect(review.draft.reviewedHash).toBe(
      configurationHash({ snapshot: canonicalSnapshot(snapshot), metadata: null }),
    );
    await expect(service.publishDraft(1, true, review.draft.reviewedHash ?? '')).rejects.toThrow('draft changed');
    expect(mqtt.publish).not.toHaveBeenCalled();
  });

  it('rejects stale rollback force confirmation before changing the draft or publishing', async () => {
    const { service, mqtt, draft } = fixture();
    await service.saveDraft(1, snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    const preview = await service.previewRevision(1, 1);
    await service.saveDraft(1, { ...snapshot, logicalChannels: [] });
    await service.reviewDraft(1);
    await service.publishDraft(1, true);
    const before = { ...draft() };
    await expect(
      service.rollback(
        1,
        1,
        true,
        preview.revision.contentHash,
        preview.current?.contentHash ?? null,
        preview.draftHash,
      ),
    ).rejects.toThrow('configuration changed');
    expect(draft()).toEqual(before);
    expect(mqtt.publish).toHaveBeenCalledTimes(2);
    await expect(
      service.rollback(
        1,
        1,
        true,
        'wrong-source',
        configurationHash({ ...snapshot, logicalChannels: [] }),
        preview.draftHash,
      ),
    ).rejects.toThrow('configuration changed');
  });

  it.each([null, undefined, '{}', '{"editor":null}'])(
    'clears newer editor provenance when rolling back historical metadata %s',
    async (historicalMetadata) => {
      const { service, draft, revisions, mqtt } = fixture();
      await service.saveDraft(1, snapshot);
      await service.reviewDraft(1);
      await service.publishDraft(1);
      revisions[0].presetProvenance = historicalMetadata;
      const historical = { ...revisions[0] };
      await service.saveDraft(1, snapshot, {
        names: { output: 'Newer name' },
        presets: [{ presetId: 'generic-digital-output', channelId: 'output', physicalPointId: 'point' }],
      });
      const restored = await rollback(service, 1, true);
      expect(JSON.parse(restored.presetProvenance ?? '{}')).toEqual({ editor: { names: {}, presets: [] } });
      expect(draft()?.presetProvenance).toBe(restored.presetProvenance);
      expect(restored.contentHash).toBe(historical.contentHash);
      expect(revisions[0]).toEqual(historical);
      expect(JSON.parse(String(mqtt.publish.mock.calls[1][2])).snapshot).toEqual(snapshot);
    },
  );

  it.each(['names', 'presets'] as const)(
    'rejects an earlier review after another editor changes only %s and reviews again',
    async (change) => {
      const { service, draft, mqtt } = fixture();
      await service.saveDraft(1, snapshot, { names: { output: 'Original' }, presets: [] });
      const first = await service.reviewDraft(1);
      const metadata = {
        names: { output: change === 'names' ? 'Renamed' : 'Original' },
        presets:
          change === 'presets'
            ? [{ presetId: 'generic-digital-output' as const, channelId: 'output', physicalPointId: 'point' }]
            : [],
      };
      await service.saveDraft(1, snapshot, metadata);
      const second = await service.reviewDraft(1);
      expect(second.draft.snapshot).toBe(first.draft.snapshot);
      expect(second.draft.reviewedHash).not.toBe(first.draft.reviewedHash);
      expect(second.draft.reviewedHash).toBe(draft()?.reviewedHash);
      await expect(service.publishDraft(1, true, first.draft.reviewedHash ?? '')).rejects.toThrow('draft changed');
      expect(mqtt.publish).not.toHaveBeenCalled();
      const published = await service.publishDraft(1, true, second.draft.reviewedHash ?? '');
      expect(published.contentHash).toBe(configurationHash(snapshot));
      expect(published.contentHash).not.toBe(second.draft.reviewedHash);
      expect(JSON.parse(published.presetProvenance ?? '{}').editor).toEqual(metadata);
      expect(JSON.parse(String(mqtt.publish.mock.calls[0][2]))).toMatchObject({
        contentHash: configurationHash(snapshot),
        snapshot,
      });
    },
  );

  it('requires a fresh review for previously stored snapshot-only review hashes', async () => {
    const { service, drafts, mqtt } = fixture();
    const saved = await service.saveDraft(1, snapshot);
    await drafts.save({ ...saved, reviewedHash: configurationHash(snapshot) });
    await expect(service.publishDraft(1, true)).rejects.toThrow('review the current');
    expect(mqtt.publish).not.toHaveBeenCalled();
    const review = await service.reviewDraft(1);
    await expect(service.publishDraft(1, true, review.draft.reviewedHash ?? '')).resolves.toMatchObject({
      contentHash: configurationHash(snapshot),
    });
  });

  it.each(['unchanged', 'name-only', 'unrelated-input'] as const)(
    'requires command acknowledgement for %s publication and rollback preview',
    async (change) => {
      const { service, mqtt, flowQuery } = fixture();
      await service.saveDraft(1, snapshot);
      await service.reviewDraft(1);
      await service.publishDraft(1);
      flowQuery.getMany.mockResolvedValue([
        {
          id: 'command-1',
          resourceId: 2,
          type: 'plugin.wago.command',
          data: { controllerId: 1, channelId: 'output', expectedConfigurationRevision: 1 },
        },
      ]);
      const candidate: WagoConfigurationSnapshot =
        change === 'unrelated-input'
          ? {
              ...snapshot,
              physicalPoints: [
                ...snapshot.physicalPoints,
                { id: 'input-point', hardwareProfile: '751-9301', channel: 4 },
              ],
              logicalChannels: [
                ...snapshot.logicalChannels,
                {
                  id: 'input',
                  physicalPointId: 'input-point',
                  profile: 'generic-monitored-input',
                  capabilities: ['input'],
                  disconnectPolicy: { mode: 'hold' },
                },
              ],
            }
          : snapshot;
      await service.saveDraft(1, candidate, {
        names: { output: change === 'name-only' ? 'Renamed' : 'Output' },
        presets: [],
      });
      const review = await service.reviewDraft(1);
      expect(review.impacts).toEqual([
        expect.objectContaining({ channelId: 'output', message: expect.stringContaining('Reopen and save') }),
      ]);
      expect((await service.previewRevision(1, 1)).impacts).toEqual(review.impacts);
      await expect(service.publishDraft(1)).rejects.toThrow('acknowledge');
      expect(mqtt.publish).toHaveBeenCalledTimes(1);
      await service.publishDraft(1, true, review.draft.reviewedHash ?? '');
      expect(mqtt.publish).toHaveBeenCalledTimes(2);
    },
  );

  it('checks newly added command references at publication, not just at review', async () => {
    const { service, mqtt, flowQuery } = fixture();
    await service.saveDraft(1, snapshot);
    await service.reviewDraft(1);
    flowQuery.getMany.mockResolvedValue([
      { id: 'new-command', resourceId: 2, type: 'plugin.wago.command', data: { controllerId: 1, channelId: 'output' } },
    ]);
    await expect(service.publishDraft(1)).rejects.toThrow('acknowledge');
    expect(mqtt.publish).not.toHaveBeenCalled();
  });

  it('does not authorize a failed review or bypass a failed lookup with force', async () => {
    const { service, draft, drafts, mqtt, flowQuery } = fixture();
    await service.saveDraft(1, snapshot);
    drafts.save.mockClear();
    flowQuery.getMany.mockRejectedValueOnce(new Error('flow lookup failed'));
    await expect(service.reviewDraft(1)).rejects.toThrow('flow lookup failed');
    expect(draft()?.reviewedHash).toBeNull();
    expect(drafts.save).not.toHaveBeenCalled();
    await expect(service.publishDraft(1, true)).rejects.toThrow('review');
    await service.reviewDraft(1);
    flowQuery.getMany.mockRejectedValueOnce(new Error('flow lookup failed'));
    await expect(service.publishDraft(1, true)).rejects.toThrow('flow lookup failed');
    expect(mqtt.publish).not.toHaveBeenCalled();
  });

  it('holds the configuration lock while looking up review impacts', async () => {
    const { service, draft, flowQuery } = fixture();
    await service.saveDraft(1, snapshot);
    let release!: (nodes: never[]) => void;
    let entered!: () => void;
    const lookup = new Promise<void>((resolve) => {
      entered = resolve;
    });
    flowQuery.getMany.mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const review = service.reviewDraft(1);
    await lookup;
    const save = service.saveDraft(1, { ...snapshot, logicalChannels: [] });
    expect(draft()?.reviewedHash).toBeNull();
    release([]);
    const reviewed = await review;
    await save;
    expect(reviewed.draft.snapshot).toBe(canonicalSnapshot(snapshot));
    expect(draft()?.reviewedHash).toBeNull();
    expect(JSON.parse(draft()?.snapshot ?? '{}').logicalChannels).toEqual([]);
  });

  it.each(['snapshot', 'metadata'] as const)(
    'rejects rollback after another editor changes draft %s',
    async (change) => {
      const { service, draft, mqtt } = fixture();
      await service.saveDraft(1, snapshot, { names: { output: 'Original' }, presets: [] });
      await service.reviewDraft(1);
      await service.publishDraft(1);
      const preview = await service.previewRevision(1, 1);
      await service.saveDraft(1, change === 'snapshot' ? { ...snapshot, logicalChannels: [] } : snapshot, {
        names: { output: change === 'metadata' ? 'Another editor' : 'Original' },
        presets: [],
      });
      const before = { ...draft() };
      await expect(
        service.rollback(
          1,
          1,
          true,
          preview.revision.contentHash,
          preview.current?.contentHash ?? null,
          preview.draftHash,
        ),
      ).rejects.toThrow('configuration changed');
      expect(draft()).toEqual(before);
      expect(mqtt.publish).toHaveBeenCalledTimes(1);
      await expect(
        service.rollback(1, 1, true, preview.revision.contentHash, preview.current?.contentHash ?? null),
      ).rejects.toThrow('configuration changed');
    },
  );

  it('validates historical snapshots before replacing the saved draft', async () => {
    const { service, draft, revisions, mqtt } = fixture();
    await service.saveDraft(1, snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    const historical = { ...snapshot, physicalPoints: [{ ...snapshot.physicalPoints[0], channel: 12 }] };
    revisions[0].snapshot = canonicalSnapshot(historical);
    revisions[0].contentHash = configurationHash(historical);
    const before = { ...draft() };
    await expect(rollback(service, 1, true)).rejects.toThrow('rollback configuration is invalid');
    expect(draft()).toEqual(before);
    expect(mqtt.publish).toHaveBeenCalledTimes(1);
  });

  it('retains the replacement draft and pending revision when rollback delivery fails', async () => {
    const { service, draft, revisions, mqtt } = fixture();
    await service.saveDraft(1, snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    await service.saveDraft(1, { ...snapshot, logicalChannels: [] });
    mqtt.publish.mockRejectedValueOnce(new Error('delivery failed'));
    await expect(rollback(service, 1, true)).rejects.toThrow('delivery failed');
    expect(draft()?.snapshot).toBe(canonicalSnapshot(snapshot));
    expect(revisions[1]).toMatchObject({ revision: 2, state: 'pending', snapshot: canonicalSnapshot(snapshot) });
  });

  it.each(['names', 'presets', 'unchanged'] as const)(
    'compares %s metadata when retrying pending publication',
    async (change) => {
      const { service, revisions, mqtt } = fixture();
      const metadata = { names: { output: 'Original' }, presets: [] };
      await service.saveDraft(1, snapshot, metadata);
      await service.reviewDraft(1);
      mqtt.publish.mockRejectedValueOnce(new Error('delivery failed'));
      await expect(service.publishDraft(1)).rejects.toThrow('delivery failed');
      const original = { ...revisions[0] };
      const nextMetadata = {
        names: { output: change === 'names' ? 'Renamed' : 'Original' },
        presets:
          change === 'presets'
            ? [{ presetId: 'generic-digital-output' as const, channelId: 'output', physicalPointId: 'point' }]
            : [],
      };
      await service.saveDraft(1, snapshot, nextMetadata);
      await service.reviewDraft(1);
      const published = await service.publishDraft(1);
      expect(published.revision).toBe(change === 'unchanged' ? 1 : 2);
      expect(JSON.parse(published.presetProvenance ?? '{}').editor).toEqual(nextMetadata);
      if (change !== 'unchanged') expect(revisions[0]).toEqual(original);
    },
  );
});
