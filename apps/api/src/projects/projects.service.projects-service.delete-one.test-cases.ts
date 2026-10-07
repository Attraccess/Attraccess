import { DataSource } from 'typeorm';
import { ProjectsService } from './projects.service';
import {
  entities,
  Project,
  ProjectInvitation,
  ProjectMember,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { FileStorageService } from '../common/services/file-storage.service';
import { ProjectAccessService } from './project-access.service';
import { EmailService } from '../email/email.service';
import { NotFoundException } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { AuditService } from '../audit/audit.service';
import { registerProjectsServiceFixture } from './projects.service.projects-service.test-fixture';
export function registerDeleteOneCases(fixture: ReturnType<typeof registerProjectsServiceFixture>) {
  describe('deleteOne', () => {
    it('unlinks resource usage entries before deleting the project', async () => {
      fixture.resourceUsageRepository.update.mockResolvedValue({} as never);
      fixture.projectRepository.delete.mockResolvedValueOnce({ affected: 1 } as never);

      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce({
        id: 99,
        name: 'Deleted',
        logo: null,
      } as Project);
      await fixture.service.deleteOne(7, 99);

      expect(fixture.resourceUsageRepository.update).toHaveBeenCalledWith({ projectId: 99 }, { projectId: null });
      expect(fixture.projectRepository.delete).toHaveBeenCalledWith(99);
      expect(fixture.audit.recordProject).toHaveBeenCalledWith({
        action: 'project.deleted',
        actorId: 7,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 99,
        details: { projectId: 99, 'before.name': 'Deleted', 'before.hasLogo': 0 },
      });
    });

    it('rolls back usage detachment when the project delete affects no row', async () => {
      fixture.resourceUsageRepository.update.mockResolvedValue({} as never);
      fixture.projectRepository.delete.mockResolvedValueOnce({ affected: 0 } as never);
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce({
        id: 99,
        name: 'Deleted',
        logo: null,
      } as Project);

      await expect(fixture.service.deleteOne(7, 99)).rejects.toBeInstanceOf(NotFoundException);

      expect(fixture.audit.recordProject).not.toHaveBeenCalled();
      expect(fixture.mockMetricsService.projectsTotal.dec).not.toHaveBeenCalled();
    });

    it('rolls back SQLite usage detachment on a delete abort and records only the successful delete', async () => {
      const source = await new DataSource({
        type: 'sqlite',
        database: ':memory:',
        entities: Object.values(entities),
        synchronize: true,
      }).initialize();
      try {
        await source.query('PRAGMA foreign_keys = OFF');
        await source.query("INSERT INTO user (username, email) VALUES ('owner', 'owner@example.test')");
        await source.query("INSERT INTO project (userId, name) VALUES (1, 'Project')");
        await source.query(
          "INSERT INTO resource_usage (usageAction, resourceId, startTime, projectId) VALUES ('usage', 1, CURRENT_TIMESTAMP, 1)",
        );
        const projects = source.getRepository(Project);
        const sqliteAudit = { recordProject: jest.fn().mockResolvedValue(undefined) };
        const sqliteMetrics = { projectsTotal: { inc: jest.fn(), dec: jest.fn() } };
        const sqliteService = new ProjectsService(
          projects,
          source.getRepository(ProjectMember),
          source.getRepository(ProjectInvitation),
          source.getRepository(User),
          source.getRepository(ResourceUsage),
          {} as FileStorageService,
          {
            ensureOwner: jest.fn().mockResolvedValue({ id: 1, name: 'Project', logo: null }),
          } as unknown as ProjectAccessService,
          {} as EmailService,
          sqliteMetrics as MetricsService,
          {} as NotificationDispatchService,
          sqliteAudit as unknown as AuditService,
        );
        await source.query(
          "CREATE TRIGGER abort_project_delete BEFORE DELETE ON project BEGIN SELECT RAISE(ABORT, 'delete aborted'); END",
        );

        await expect(sqliteService.deleteOne(1, 1)).rejects.toThrow('delete aborted');
        expect((await source.query('SELECT projectId FROM resource_usage WHERE id = 1'))[0].projectId).toBe(1);
        expect(sqliteAudit.recordProject).not.toHaveBeenCalled();
        expect(sqliteMetrics.projectsTotal.dec).not.toHaveBeenCalled();

        await source.query('DROP TRIGGER abort_project_delete');
        await sqliteService.deleteOne(1, 1);
        expect((await source.query('SELECT projectId FROM resource_usage WHERE id = 1'))[0].projectId).toBeNull();
        expect(sqliteAudit.recordProject).toHaveBeenCalledTimes(1);
        expect(sqliteMetrics.projectsTotal.dec).toHaveBeenCalledTimes(1);
        await expect(sqliteService.deleteOne(1, 1)).rejects.toBeInstanceOf(NotFoundException);
        expect(sqliteAudit.recordProject).toHaveBeenCalledTimes(1);
      } finally {
        await source.destroy();
      }
    });
  });
}
