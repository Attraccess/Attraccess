import { Project } from '@attraccess/database-entities';
import { FileUpload } from '../common/types/file-upload.types';
import { UpdateProjectDto } from './dto/update.dto';
import { NotFoundException } from '@nestjs/common';
import { registerProjectsServiceFixture } from './projects.service.projects-service.test-fixture';
export function registerUpdateOneCases(fixture: ReturnType<typeof registerProjectsServiceFixture>) {
  describe('updateOne', () => {
    it('throws when the project is missing', async () => {
      fixture.projectAccessService.ensureOwner.mockRejectedValueOnce(new NotFoundException());
      await expect(fixture.service.updateOne(1, 1, {} as UpdateProjectDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates fields when project exists', async () => {
      const existing = { id: 3, name: 'Old', description: 'Old', logo: null } as Project;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      fixture.projectRepository.save.mockImplementation(async (entity: Project) => entity);

      const updated = await fixture.service.updateOne(1, 3, { name: 'New' } as UpdateProjectDto);

      expect(fixture.projectRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: 3, name: 'New' }));
      expect(updated.name).toBe('New');
      expect(fixture.audit.recordProject).toHaveBeenCalledWith({
        action: 'project.updated',
        actorId: 1,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 3,
        details: {
          projectId: 3,
          'before.name': 'Old',
          'before.hasLogo': 0,
          'after.name': 'New',
          'after.hasLogo': 0,
          changedFields: '["name"]',
        },
      });
    });

    it('replaces logos when requested', async () => {
      const existing = { id: 3, name: 'Old', description: 'Old', logo: 'old.png' } as Project;
      const payload = { logo: Buffer.from('n') as unknown as FileUpload } as UpdateProjectDto;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      fixture.fileStorageService.saveFile.mockResolvedValueOnce('new.png');
      fixture.projectRepository.save.mockImplementation(async (entity: Project) => entity);

      const result = await fixture.service.updateOne(1, 3, payload);

      expect(fixture.fileStorageService.deleteFile).toHaveBeenCalledWith('projects/3', 'old.png');
      expect(fixture.fileStorageService.saveFile).toHaveBeenCalledWith(payload.logo, 'projects/3');
      expect(result.logo).toBe('new.png');
      expect(fixture.audit.recordProject).toHaveBeenCalledWith({
        action: 'project.updated',
        actorId: 1,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 3,
        details: {
          projectId: 3,
          'before.name': 'Old',
          'before.hasLogo': 1,
          'after.name': 'Old',
          'after.hasLogo': 1,
          changedFields: '["logo"]',
        },
      });
    });

    it('records an update when its only project save succeeds', async () => {
      const existing = { id: 3, name: 'Old', description: 'Old', logo: 'old.png' } as Project;
      const payload = { name: 'New', logo: Buffer.from('n') as unknown as FileUpload } as UpdateProjectDto;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      fixture.fileStorageService.saveFile.mockResolvedValueOnce('new.png');
      fixture.projectRepository.save.mockImplementation(async (entity: Project) => entity);

      await fixture.service.updateOne(1, 3, payload);

      expect(fixture.projectRepository.save).toHaveBeenCalledTimes(1);
      expect(fixture.audit.recordProject).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.updated',
          details: expect.objectContaining({ changedFields: '["name","logo"]' }),
        }),
      );
    });

    it('does not record an update when safe state values are unchanged', async () => {
      const existing = { id: 3, name: 'Same', description: 'Same', logo: null } as Project;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      fixture.projectRepository.save.mockImplementation(async (entity: Project) => entity);

      await fixture.service.updateOne(1, 3, { name: 'Same', description: 'Same' } as UpdateProjectDto);

      expect(fixture.audit.recordProject).not.toHaveBeenCalled();
    });

    it('does not record an unchanged legacy long-name update', async () => {
      const longName = '😀'.repeat(100);
      const existing = { id: 3, name: longName, description: 'Same', logo: null } as Project;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      fixture.projectRepository.save.mockImplementation(async (entity: Project) => entity);

      await fixture.service.updateOne(1, 3, { name: longName } as UpdateProjectDto);

      expect(fixture.audit.recordProject).not.toHaveBeenCalled();
    });

    it('records archive lifecycle changes with the initiating actor', async () => {
      const project = { id: 3, name: 'Project', logo: null } as Project;
      fixture.projectAccessService.ensureOwner.mockResolvedValue(project);
      fixture.projectRepository.update.mockResolvedValue({ affected: 1 } as never);

      await fixture.service.archiveOne(2, 3);
      await fixture.service.unarchiveOne(2, 3);

      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(1, {
        action: 'project.archived',
        actorId: 2,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 3,
        details: { projectId: 3, 'after.name': 'Project', 'after.hasLogo': 0, 'after.archived': 1 },
      });
      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(2, {
        action: 'project.unarchived',
        actorId: 2,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 3,
        details: { projectId: 3, 'after.name': 'Project', 'after.hasLogo': 0, 'after.archived': 0 },
      });
    });

    it('returns the refetched lifecycle state without recording a duplicate event', async () => {
      const archivedProject = { id: 3, name: 'Archived', archivedAt: new Date(), logo: null } as Project;
      const activeProject = { id: 4, name: 'Active', archivedAt: null, logo: null } as Project;
      const concurrentlyArchived = { id: 3, name: 'Archived', archivedAt: new Date(), logo: null } as Project;
      const concurrentlyUnarchived = { id: 4, name: 'Active', archivedAt: null, logo: null } as Project;
      fixture.projectAccessService.ensureOwner
        .mockResolvedValueOnce(archivedProject)
        .mockResolvedValueOnce(activeProject);
      fixture.projectRepository.update.mockResolvedValue({ affected: 0 } as never);
      fixture.projectRepository.findOneByOrFail
        .mockResolvedValueOnce(concurrentlyArchived)
        .mockResolvedValueOnce(concurrentlyUnarchived);

      expect(await fixture.service.archiveOne(2, 3)).toBe(concurrentlyArchived);
      expect(await fixture.service.unarchiveOne(2, 4)).toBe(concurrentlyUnarchived);

      expect(fixture.projectRepository.save).not.toHaveBeenCalled();
      expect(fixture.projectRepository.update).toHaveBeenCalledTimes(2);
      expect(fixture.projectRepository.findOneByOrFail).toHaveBeenNthCalledWith(1, { id: 3 });
      expect(fixture.projectRepository.findOneByOrFail).toHaveBeenNthCalledWith(2, { id: 4 });
      expect(fixture.audit.recordProject).not.toHaveBeenCalled();
    });
  });
}
