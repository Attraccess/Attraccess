import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { WagoConfigurationSnapshot } from './configuration/model';
import { spyOnWagoStorage } from './storage-spy.test-utils';
import { createWagoTestStorage } from './storage/testing';
import { revisionRow } from './rows.test-utils';
import { hostDataWithFlows } from './persistence.test-utils';
import { WagoService } from './controllers/service';
import { CHANNEL_ENABLED_CAPABILITY } from '../shared/capabilities';

/** Capabilities the fixture controller advertises: a current runtime that can disable channels. */
export const FIXTURE_CAPABILITIES = ['claim', 'heartbeat', 'configuration-v1', CHANNEL_ENABLED_CAPABILITY];

/** Shared in-memory editor service fixture for the configuration editor specs. */
export const snapshot: WagoConfigurationSnapshot = {
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
export function fixture({ capabilities = FIXTURE_CAPABILITIES }: { capabilities?: string[] } = {}) {
  const test = createWagoTestStorage();
  const spy = spyOnWagoStorage(test);
  /** Draft writes since the last `clear`: assertions that a code path saved nothing. */
  const drafts = {
    writes: () => spy.writes('configurationDrafts'),
    clear: () => Object.values(spy.spied.configurationDrafts).forEach((method) => method.mockClear()),
    /** Edits the stored draft row directly, as another editor session would. */
    update: (patch: Parameters<typeof test.tables.configurationDrafts.update>[1]) =>
      test.tables.configurationDrafts.update({ controllerId: 1 }, patch),
  };
  /** The stored revisions in revision order: seed or edit them as another writer would. */
  const revisions = {
    all: () => test.tables.configurationRevisions.find({ orderBy: [{ field: 'revision' }] }),
    at: async (index: number) => (await revisions.all())[index],
    first: async () => (await revisions.all())[0],
    count: () => test.tables.configurationRevisions.count(),
    add: (row: Record<string, unknown> & { revision: number }) =>
      test.tables.configurationRevisions.insert(
        revisionRow({
          controllerId: 1,
          ...Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)),
        }),
      ),
    update: (revision: number, patch: Parameters<typeof test.tables.configurationRevisions.update>[1]) =>
      test.tables.configurationRevisions.update({ controllerId: 1, revision }, patch),
  };
  const mqtt = {
    publish: jest.fn<ReturnType<PluginContext['mqtt']['publish']>, Parameters<PluginContext['mqtt']['publish']>>(
      async () => undefined,
    ),
  };
  // The host flow lookup; specs steer its answer through `flowQuery.getMany`.
  const flowQuery = { getMany: jest.fn().mockResolvedValue([]) };
  const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
  const service = new WagoService({
    mqtt,
    audit,
    logger: { warn: jest.fn() },
    ...spy.context,
    hostData: hostDataWithFlows(() => flowQuery.getMany()),
  } as unknown as PluginContext);
  // The controller is not under test: one claimed controller answers every lookup.
  const claimed = {
    id: 1,
    hardwareId: 'local-test',
    trustState: 'claimed',
    mqttServerId: 1,
    protocolVersion: '1.0.0',
    capabilities: JSON.stringify(capabilities),
  };
  Object.assign(service, {
    storage: spy.spied,
    controllers: { get: jest.fn(async () => claimed), findOne: jest.fn(async () => claimed) },
    drafts: spy.spied.configurationDrafts,
    revisions: spy.spied.configurationRevisions,
  });
  jest
    .spyOn(service, 'getSettings')
    .mockResolvedValue({ id: 1, defaultMqttServerId: 1, operationalPrefix: 'test/wago' });
  return {
    service,
    drafts,
    mqtt,
    revisions,
    flowQuery,
    audit,
    draft: () => test.rows('configurationDrafts')[0] ?? null,
  };
}

export async function rollback(service: WagoService, revision: number, force = false) {
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
