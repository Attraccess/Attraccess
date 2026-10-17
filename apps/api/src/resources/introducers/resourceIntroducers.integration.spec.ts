import {
  entities,
  ResourceType,
  Resource,
  ResourceGroup,
  ResourceIntroducer,
  ResourceIntroducerType,
  User,
} from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import * as migrations from '../../database/migrations';
import { ResourceListService } from '../../attractap/websockets/handlers/resource-list/resource-list.service';
import { AuthenticatedWebSocket } from '../../attractap/websockets/websocket.types';
import { ResourceIntroducersService } from './resourceIntroducers.service';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';

// Use migrated, persisted memberships: mocked aggregated rows cannot catch a broken join.
describe('persisted resource introducer aggregation', () => {
  let source: DataSource;
  let service: ResourceIntroducersService;
  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();
    service = new ResourceIntroducersService(
      source.getRepository(ResourceIntroducer),
      source.getRepository(User),
      new EventEmitter2(),
      { dispatch: jest.fn() } as unknown as NotificationDispatchService,
    );
    await source.getRepository(User).insert(
      Array.from({ length: 6 }, (_, index) => ({
        id: index + 1,
        username: `Tutor ${index + 1}`,
        email: `tutor${index + 1}@example.test`,
      })),
    );
    await source.getRepository(User).insert({ id: 99, username: 'Learner', email: 'learner@example.test' });
    await source.getRepository(Resource).insert([
      { id: 1, name: 'Lathe', type: ResourceType.Machine },
      { id: 2, name: 'Mill', type: ResourceType.Machine },
    ]);
    await source.getRepository(ResourceGroup).insert([
      { id: 1, name: 'Workshop' },
      { id: 2, name: 'Machines' },
    ]);
    await source.createQueryBuilder().relation(Resource, 'groups').of(1).add([1, 2]);
    await source.createQueryBuilder().relation(Resource, 'groups').of(2).add(2);
    await source.getRepository(ResourceIntroducer).insert([
      { resourceId: 1, userId: 1 },
      { resourceGroupId: 1, userId: 6 },
      { resourceId: 1, userId: 6 },
      { resourceGroupId: 1, userId: 2 },
      { resourceGroupId: 2, userId: 3 },
      { resourceGroupId: 1, userId: 1 },
      { resourceGroupId: 2, userId: 1 },
      { resourceGroupId: 2, userId: 4, type: ResourceIntroducerType.MAINTAINER },
      { resourceId: 1, userId: 5, type: ResourceIntroducerType.MAINTAINER },
    ]);
    await source.getRepository(User).softDelete(6);
  }, 60_000);
  afterEach(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  it('returns the complete unique tutor union for web and reader queries without maintainer-only users', async () => {
    const web = await service.getMany(1, ResourceIntroducerType.INTRODUCER);
    const reader = await service.getManyForResources([1, 2, 1], ResourceIntroducerType.INTRODUCER);
    expect(web.map((row) => row.user.id).sort()).toEqual([1, 2, 3]);
    expect(
      reader
        .get(1)
        .map((row) => row.user.id)
        .sort(),
    ).toEqual([1, 2, 3]);
    expect(
      reader
        .get(2)
        .map((row) => row.user.id)
        .sort(),
    ).toEqual([1, 3]);
  });

  it('sends persisted group tutors to an ordinary unintroduced reader user even while occupied', async () => {
    const list = new ResourceListService();
    Object.assign(list, {
      attractapService: {
        findReaderById: async () => ({ resources: await source.getRepository(Resource).find(), name: 'Reader' }),
      },
      resourceIntroducersService: service,
      resourceHealthService: { listForResources: async () => new Map() },
      resourceMaintenanceService: {
        getActiveMaintenanceResourceIds: async () => new Set(),
        getMaintenanceManagedResourceIds: async () => new Set(),
      },
      resourceFlowsService: { getNodesForResources: async () => new Map() },
      resourceUsageService: {
        getActiveSessions: async () =>
          new Map([[1, { user: { username: 'Occupant' }, startTime: new Date('2026-10-02T10:00:00Z') }]]),
        canControllResource: async () => false,
      },
      usersService: { findOne: async () => source.getRepository(User).findOneByOrFail({ id: 99 }) },
      rbacService: { getEffectivePermissions: async () => new Set() },
    });
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const socket = {
      readerId: 1,
      state: { lastAuthenticatedUserId: 99 },
      sendMessage,
    } as unknown as AuthenticatedWebSocket;
    await list.sendResourceListToSocket(socket);
    const payload = sendMessage.mock.calls[0][0].data.payload;
    const lathe = payload.resources.find((resource: { id: number }) => resource.id === 1);
    expect(lathe.introducers.sort()).toEqual(['Tutor 1', 'Tutor 2', 'Tutor 3']);
    expect(lathe.hasIntroduction).toBe(false);
    expect(lathe.activeUsageSession.user.username).toBe('Occupant');
  });

  it('reflects revoked grants and removed memberships on the next query', async () => {
    await source.getRepository(ResourceIntroducer).delete({ resourceGroupId: 1, userId: 2 });
    await source.createQueryBuilder().relation(Resource, 'groups').of(1).remove(2);
    expect((await service.getMany(1, ResourceIntroducerType.INTRODUCER)).map((row) => row.userId)).toEqual([1]);
    const reader = await service.getManyForResources([1, 2], ResourceIntroducerType.INTRODUCER);
    expect(reader.get(1).map((row) => row.userId)).toEqual([1]);
    expect(
      reader
        .get(2)
        .map((row) => row.userId)
        .sort(),
    ).toEqual([1, 3]);
    await source.getRepository(ResourceIntroducer).insert({ resourceGroupId: 2, userId: 4 });
    await source.createQueryBuilder().relation(Resource, 'groups').of(1).add(2);
    const refreshed = await service.getManyForResources([1, 2], ResourceIntroducerType.INTRODUCER);
    expect(
      refreshed
        .get(1)
        .map((row) => row.userId)
        .sort(),
    ).toEqual([1, 3, 4]);
    expect((await service.getMany(1, ResourceIntroducerType.INTRODUCER)).map((row) => row.userId).sort()).toEqual([
      1, 3, 4,
    ]);
  });
});
