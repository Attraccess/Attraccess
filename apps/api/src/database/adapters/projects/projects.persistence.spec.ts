import {
  BillingTransactionStatus,
  ProjectInvitationStatus,
  ProjectMemberRole,
  type ProjectInvitationRecord,
  ResourceUsageAction,
} from '@attraccess/application-models';
import {
  BillingTransaction,
  Project,
  ProjectInvitation,
  ProjectMember,
  ResourceUsage,
  Setting,
  User,
} from '@attraccess/database-entities';
import type { DataSource } from 'typeorm';
import { toProjectInvitationDto } from '../../../projects/dto/project.dto';
import { ProjectsService } from '../../../projects/projects.service';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
  type TestDatabaseLocation,
} from '../../../test-utils/test-database';
import { unitOfWorkFor } from '../shared-unit-of-work';
import type { TransactionScope } from '../../unit-of-work';
import { TypeOrmProjectInvitationStore } from './typeorm-project-invitation.store';
import { TypeOrmProjectStore } from './typeorm-project.store';
import { TypeOrmProjectUsageStore } from './typeorm-project-usage.store';
import { getProjectUsageStats } from '../../../projects/project-usage-statistics';

describe('project persistence adapters on real PostgreSQL', () => {
  let database: TestDatabaseLocation;
  let source: DataSource;
  let uow: ReturnType<typeof unitOfWorkFor>;
  let projects: TypeOrmProjectStore;
  let invitations: TypeOrmProjectInvitationStore;
  let usage: TypeOrmProjectUsageStore;

  const query = (sql: string, parameters?: unknown[]) => source.query(sql, parameters);

  beforeAll(async () => {
    database = await createTestDatabaseLocation();
    source = await createTestDataSource({ location: database.location });
    uow = unitOfWorkFor(source);
    projects = new TypeOrmProjectStore(source.getRepository(Project), source.getRepository(ProjectMember), uow);
    invitations = new TypeOrmProjectInvitationStore(
      source.getRepository(ProjectInvitation),
      source.getRepository(ProjectMember),
      source.getRepository(User),
    );
    usage = new TypeOrmProjectUsageStore(
      source.getRepository(ResourceUsage),
      source.getRepository(BillingTransaction),
      source.getRepository(Setting),
    );
  }, 60_000);

  afterAll(async () => {
    await closeTestDataSource(source);
    await database.remove();
  });

  beforeEach(async () => {
    await query(
      'TRUNCATE "billing_transaction", "resource_usage", "project_invitations", "project_members", "project", "resource", "user", "setting" RESTART IDENTITY CASCADE',
    );
    await query(`INSERT INTO "user" ("id", "username", "email") VALUES
      (1, 'owner', 'owner@example.test'), (2, 'member', 'member@example.test'), (3, 'stranger', 'stranger@example.test')`);
    // The rows above carry fixed ids: keep the sequence behind them.
    await query(`SELECT setval(pg_get_serial_sequence('"user"', 'id'), 3)`);
  });

  describe('ProjectStore', () => {
    it('maps a project with its owner and never copies private user fields', async () => {
      await query(
        'UPDATE "user" SET "passwordResetToken" = \'reset-secret\', "emailVerificationToken" = \'verify-secret\' WHERE id = 1',
      );
      const created = await projects.create({ ownerId: 1, name: 'Workshop', description: null });

      const found = await projects.findWithOwner(created.id);

      expect(found).toMatchObject({
        id: created.id,
        name: 'Workshop',
        description: null,
        logo: null,
        archivedAt: null,
      });
      expect(found?.owner).toMatchObject({ id: 1, username: 'owner', isDisabled: false, creditBalance: 0 });
      const serialized = JSON.stringify(found);
      for (const secret of ['owner@example.test', 'reset-secret', 'verify-secret', 'passwordResetToken']) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('answers ownership and membership lookups', async () => {
      const { id } = await projects.create({ ownerId: 1, name: 'A', description: null });
      await query('INSERT INTO project_members ("projectId", "userId", role) VALUES ($1, 2, $2)', [id, 'viewer']);

      expect((await projects.findOwned(1, id))?.id).toBe(id);
      expect(await projects.findOwned(2, id)).toBeNull();
      expect(await projects.findMembership(id, 2)).toMatchObject({ projectId: id, userId: 2, role: 'viewer' });
      expect(await projects.findMembership(id, 3)).toBeNull();
      expect((await projects.findMembershipsOfUser(2, [id, 999])).map((member) => member.projectId)).toEqual([id]);
    });

    it('lists projects the user owns or belongs to, ordered by name, hiding archived ones unless asked', async () => {
      const b = await projects.create({ ownerId: 1, name: 'Beta', description: null });
      const a = await projects.create({ ownerId: 1, name: 'Alpha', description: null });
      const shared = await projects.create({ ownerId: 3, name: 'Gamma', description: null });
      await projects.create({ ownerId: 3, name: 'Hidden', description: null });
      const archived = await projects.create({ ownerId: 1, name: 'Delta', description: null });
      await query('INSERT INTO project_members ("projectId", "userId", role) VALUES ($1, 1, $2)', [
        shared.id,
        'viewer',
      ]);
      await projects.archive(archived.id, new Date());

      const names = async (extra: object = {}) =>
        (await projects.listAccessible(1, { page: 1, limit: 10, ...extra })).map((project) => project.name);

      expect(await names()).toEqual(['Alpha', 'Beta', 'Gamma']);
      expect(await names({ includeArchived: true })).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
      expect(await projects.countAccessible(1, {})).toBe(3);
      expect(await projects.countAccessible(1, { includeArchived: true })).toBe(4);
      expect((await projects.listAccessible(1, { page: 2, limit: 2 })).map((project) => project.id)).toEqual([
        shared.id,
      ]);
      expect([a.id, b.id]).toHaveLength(2);
    });

    it('matches names case-insensitively and treats LIKE wildcards and backslashes literally', async () => {
      await projects.create({ ownerId: 1, name: 'Laser Cutter', description: null });
      await projects.create({ ownerId: 1, name: '100%_a\\b', description: null });
      await projects.create({ ownerId: 1, name: '100xxab', description: null });

      const found = async (search: string) =>
        (await projects.listAccessible(1, { page: 1, limit: 10, search })).map((project) => project.name);

      expect(await found('  lASer ')).toEqual(['Laser Cutter']);
      expect(await found('100%_a\\b')).toEqual(['100%_a\\b']);
      expect(await projects.countAccessible(1, { search: '100%_a\\b' })).toBe(1);
      expect(await found('   ')).toHaveLength(3);
    });

    it('archives and unarchives once and reports when nothing changed', async () => {
      const { id } = await projects.create({ ownerId: 1, name: 'A', description: null });
      const when = new Date('2026-02-01T10:00:00Z');

      expect(await projects.archive(id, when)).toBe(true);
      expect(await projects.archive(id, new Date())).toBe(false);
      expect((await projects.getById(id)).archivedAt).toEqual(when);
      expect(await projects.unarchive(id)).toBe(true);
      expect(await projects.unarchive(id)).toBe(false);
      expect((await projects.getById(id)).archivedAt).toBeNull();
    });

    it('updates details and returns the project with its owner', async () => {
      const { id } = await projects.create({ ownerId: 1, name: 'Old', description: 'd' });

      const updated = await projects.updateDetails(id, { name: 'New', description: null, logo: 'logo.png' });

      expect(updated).toMatchObject({ id, name: 'New', description: null, logo: 'logo.png' });
      expect(updated.owner?.id).toBe(1);
    });

    it('rolls the usage detachment back when the delete aborts, and commits both together otherwise', async () => {
      const { id } = await projects.create({ ownerId: 1, name: 'Doomed', description: null });
      await query("INSERT INTO resource (id, name, type) VALUES (1, 'Lathe', 'machine')");
      await query(
        `INSERT INTO resource_usage (id, "usageAction", "resourceId", "startTime", "isFinalized", "projectId")
         VALUES (1, 'usage', 1, CURRENT_TIMESTAMP, true, $1)`,
        [id],
      );
      await query(`CREATE FUNCTION abort_project_delete_fn() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'delete aborted'; END $$`);
      await query(
        'CREATE TRIGGER abort_project_delete BEFORE DELETE ON project FOR EACH ROW EXECUTE FUNCTION abort_project_delete_fn()',
      );
      const attached = async () => (await query('SELECT "projectId" FROM resource_usage WHERE id = 1'))[0].projectId;

      await expect(uow.run((scope) => projects.deleteProject(id, scope))).rejects.toThrow('delete aborted');
      expect(await attached()).toBe(id);

      await query('DROP TRIGGER abort_project_delete ON project');
      await query('DROP FUNCTION abort_project_delete_fn()');
      expect(await uow.run((scope) => projects.deleteProject(id, scope))).toBe(true);
      expect(await attached()).toBeNull();
      expect(await uow.run((scope) => projects.deleteProject(id, scope))).toBe(false);
    });

    it('writes the deletion audit row inside the delete transaction (service on the real unit of work)', async () => {
      const { id } = await projects.create({ ownerId: 1, name: 'Audited', description: null });
      const auditedInOpenTransaction: boolean[] = [];
      const audit = {
        // The service hands the recorder its scope; the recorder joins the transaction behind it.
        record: jest.fn(async (_event: unknown, scope?: TransactionScope) => {
          auditedInOpenTransaction.push(
            scope?.isOpen === true && uow.handleOf(scope).queryRunner?.isTransactionActive === true,
          );
        }),
      };
      const metrics = { projectsTotal: { inc: jest.fn(), dec: jest.fn() } };
      const service = new ProjectsService(
        projects,
        invitations,
        uow,
        {} as never,
        { ensureOwner: async () => ({ id, name: 'Audited', logo: null }) } as never,
        {} as never,
        metrics as never,
        {} as never,
        audit as never,
      );

      await service.deleteOne(1, id);
      expect(auditedInOpenTransaction).toEqual([true]);
      expect(metrics.projectsTotal.dec).toHaveBeenCalledTimes(1);

      await expect(service.deleteOne(1, id)).rejects.toThrow('Project not found');
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(metrics.projectsTotal.dec).toHaveBeenCalledTimes(1);
    });

    it('lists members with their public user and removes one membership', async () => {
      const { id } = await projects.create({ ownerId: 1, name: 'A', description: null });
      await query('INSERT INTO project_members (id, "projectId", "userId", role) VALUES (5, $1, 2, $2)', [
        id,
        'viewer',
      ]);

      const [member] = await projects.listMembers(id);
      expect(member).toMatchObject({ id: 5, userId: 2 });
      expect(member.user?.username).toBe('member');
      expect(JSON.stringify(member)).not.toContain('member@example.test');
      expect(await projects.findMember(id, 5)).toMatchObject({ id: 5 });
      expect(await projects.findMember(id + 1, 5)).toBeNull();
      expect(await projects.removeMember(5)).toBe(true);
      expect(await projects.removeMember(5)).toBe(false);
    });
  });

  describe('ProjectInvitationStore', () => {
    it('creates, lists and answers invitations with project, inviter and invited user', async () => {
      const { id: projectId } = await projects.create({ ownerId: 1, name: 'A', description: null });

      const created = await invitations.create({
        projectId,
        inviterId: 1,
        invitedUserId: 2,
        requestedRole: ProjectMemberRole.VIEWER,
      });

      expect(created).toMatchObject({ projectId, inviterId: 1, invitedUserId: 2, status: 'pending' });
      expect(await invitations.findPending(projectId, 2)).toMatchObject({ id: created.id });
      expect(await invitations.findPending(projectId, 3)).toBeNull();
      const [pending] = await invitations.listPendingForUser(2);
      expect(pending.project?.owner?.id).toBe(1);
      expect(pending.inviter?.email).toBe('owner@example.test');
      expect((await invitations.listForProject(projectId)).map((row) => row.id)).toEqual([created.id]);

      await invitations.recordResponse(created.id, ProjectInvitationStatus.DECLINED, new Date());
      expect(await invitations.listPendingForUser(2)).toEqual([]);
      expect((await invitations.findById(created.id))?.status).toBe('declined');
      expect(await invitations.findInvitee(2)).toMatchObject({ id: 2, email: 'member@example.test' });
      expect(await invitations.findInvitee(99)).toBeNull();
    });

    it('does not put the private user fields or any email into the HTTP shape of an invitation', async () => {
      const { id: projectId } = await projects.create({ ownerId: 1, name: 'A', description: null });
      await query('UPDATE "user" SET "passwordResetToken" = \'reset-secret\' WHERE id IN (1, 2)');
      const created = await invitations.create({
        projectId,
        inviterId: 1,
        invitedUserId: 2,
        requestedRole: ProjectMemberRole.VIEWER,
      });

      const body = JSON.stringify(
        toProjectInvitationDto((await invitations.findById(created.id)) as ProjectInvitationRecord),
      );

      expect(body).toContain('"username":"owner"');
      for (const secret of ['example.test', 'reset-secret', 'email', 'Token']) {
        expect(body).not.toContain(secret);
      }
    });

    it('adds a membership once when two acceptances race on independent connections', async () => {
      const { id: projectId } = await projects.create({ ownerId: 1, name: 'A', description: null });
      const other = await createTestDataSource({ location: database.location });
      try {
        const racing = new TypeOrmProjectInvitationStore(
          other.getRepository(ProjectInvitation),
          other.getRepository(ProjectMember),
          other.getRepository(User),
        );

        const results = await Promise.all([
          invitations.addMemberIfMissing(projectId, 2, ProjectMemberRole.VIEWER),
          racing.addMemberIfMissing(projectId, 2, ProjectMemberRole.VIEWER),
        ]);

        expect(results.filter((member) => member !== null)).toHaveLength(1);
        expect(await invitations.addMemberIfMissing(projectId, 2, ProjectMemberRole.VIEWER)).toBeNull();
        expect(
          await query('SELECT COUNT(*) AS count FROM project_members WHERE "projectId" = $1', [projectId]),
        ).toEqual([{ count: 1 }]);
      } finally {
        await closeTestDataSource(other);
      }
    });
  });

  describe('ProjectUsageStore', () => {
    const addUsage = (resourceId: number, projectId: number, startTime: string, endTime: string | null) =>
      source.getRepository(ResourceUsage).save({
        resourceId,
        projectId,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        lifecyclePending: false,
        isFinalized: true,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
      } as ResourceUsage);

    const stats = (projectId: number, range: { startDate?: Date; endDate?: Date } = {}) =>
      getProjectUsageStats(
        {
          getBillingConfiguration: async () => ({ currency: 'EUR', minorUnit: 2 }),
          readAggregates: (r) => usage.readAggregates(projectId, r),
        },
        range as never,
      );

    beforeEach(async () => {
      await query("INSERT INTO project (id, \"userId\", name) VALUES (1, 1, 'Project'), (2, 1, 'Other')");
      await query("INSERT INTO resource (id, name, type) VALUES (1, 'Lathe', 'machine'), (2, 'Laser', 'machine')");
    });

    it('reports person and machine minutes per day and resource that add up to the totals', async () => {
      await addUsage(1, 1, '2024-01-01T10:00:00Z', '2024-01-01T12:00:00Z');
      await addUsage(1, 1, '2024-01-01T11:00:00Z', '2024-01-01T13:00:00Z');
      // another project on the same machine, and an open session: both ignored
      await addUsage(1, 2, '2024-01-01T09:00:00Z', '2024-01-01T14:00:00Z');
      await addUsage(1, 1, '2024-01-01T09:30:00Z', null);
      // touching sessions stay apart
      await addUsage(2, 1, '2024-01-02T10:00:00Z', '2024-01-02T11:00:00Z');
      await addUsage(2, 1, '2024-01-02T11:00:00Z', '2024-01-02T12:00:00Z');
      // a run crossing midnight UTC counts toward the day of its earliest session
      await addUsage(2, 1, '2024-01-03T23:00:00Z', '2024-01-04T01:00:00Z');
      await addUsage(2, 1, '2024-01-04T00:30:00Z', '2024-01-04T02:00:00Z');

      const { summary, timeSeries, topResources } = await stats(1);

      expect(summary.totalSessions).toBe(6);
      expect(summary.totalMinutes).toBeCloseTo(240 + 120 + 210, 3);
      expect(summary.totalMachineMinutes).toBeCloseTo(180 + 120 + 180, 3);
      expect(
        timeSeries.map(({ date, minutes, machineMinutes }) => [date, Math.round(minutes), machineMinutes]),
      ).toEqual([
        ['2024-01-01', 240, 180],
        ['2024-01-02', 120, 120],
        ['2024-01-03', 120, 180],
        ['2024-01-04', 90, 0],
      ]);
      expect(
        topResources.map(({ resourceId, sessions, machineMinutes }) => [resourceId, sessions, machineMinutes]),
      ).toEqual([
        [2, 4, 300],
        [1, 2, 180],
      ]);

      const filtered = await stats(1, { startDate: new Date('2024-01-02T00:00:00Z') });
      expect(filtered.summary.totalMachineMinutes).toBeCloseTo(120 + 180, 3);
    });

    it('counts completed correction transactions under the project of the session they correct', async () => {
      const day = new Date('2026-05-01T10:00:00Z');
      const end = new Date('2026-05-01T11:00:00Z');
      const usageAction = ResourceUsageAction.Usage;
      const usages = source.getRepository(ResourceUsage);
      await usages.save([
        { id: 1, usageAction, resourceId: 1, projectId: 1, startTime: day, endTime: end, usageInMinutes: 60 },
        { id: 2, usageAction, resourceId: 1, projectId: 2, startTime: day, endTime: end, usageInMinutes: 60 },
      ] as ResourceUsage[]);
      const transactions = source.getRepository(BillingTransaction);
      const completed = BillingTransactionStatus.Completed;
      const first = await transactions.save({ userId: 1, resourceUsageId: 1, amount: -100, status: completed });
      const second = await transactions.save({ userId: 2, resourceUsageId: 2, amount: -50, status: completed });
      await transactions.save([
        { userId: 1, correctionOfId: first.id, amount: -30, status: completed },
        { userId: 2, correctionOfId: second.id, amount: -20, status: completed },
        { userId: 1, correctionOfId: first.id, amount: -999, status: BillingTransactionStatus.Pending },
      ] as BillingTransaction[]);

      const result = await stats(1);

      expect(result.summary.totalSpend).toBe(130);
      expect(result.topResources[0]).toMatchObject({ resourceId: 1, spend: 130 });
    });

    it('lists finished sessions of the project, newest first, as the serialized usage with its relations', async () => {
      await addUsage(1, 1, '2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z');
      await addUsage(1, 1, '2024-01-02T10:00:00Z', '2024-01-02T11:00:00Z');
      await addUsage(1, 2, '2024-01-03T10:00:00Z', '2024-01-03T11:00:00Z');

      const page = await usage.listUsageHistory(1, {}, { page: 1, limit: 1 });

      expect(page.total).toBe(2);
      expect(page.data).toHaveLength(1);
      expect(page.data[0]).toMatchObject({ projectId: 1, resource: { id: 1, name: 'Lathe' } });
      expect(new Date(page.data[0].startTime as string).toISOString()).toBe('2024-01-02T10:00:00.000Z');
      expect(
        (await usage.listUsageHistory(1, { endDate: new Date('2024-01-01T23:00:00Z') }, { page: 1, limit: 10 })).total,
      ).toBe(1);
    });

    it('reads the billing currency setting', async () => {
      expect(await usage.readBillingCurrency()).toBeNull();
      await query("INSERT INTO setting (parent, key, value) VALUES ('billing', 'currency', 'EUR')");
      expect(await usage.readBillingCurrency()).toBe('EUR');
    });
  });
});
