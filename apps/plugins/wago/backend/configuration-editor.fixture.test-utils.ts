import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { WagoConfigurationSnapshot } from './configuration/model';
import type { WagoConfigurationDraft } from './configuration/draft.entity';
import type { WagoConfigurationRevision } from './configuration/revision.entity';
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
  const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
  const service = new WagoService({
    mqtt,
    audit,
    logger: { warn: jest.fn() },
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
        capabilities: JSON.stringify(capabilities),
      })),
    },
    drafts,
    revisions: revisionRepository,
  });
  jest
    .spyOn(service, 'getSettings')
    .mockResolvedValue({ id: 1, defaultMqttServerId: 1, operationalPrefix: 'test/wago' });
  return { service, drafts, mqtt, revisions, flowQuery, audit, draft: () => draft };
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
