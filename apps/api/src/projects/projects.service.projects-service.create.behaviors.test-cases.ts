import { Project } from '@attraccess/database-entities';
import { CreateProjectDto } from './dto/create.dto';
import { FileUpload } from '../common/types/file-upload.types';
import { registerProjectsServiceFixture } from './projects.service.projects-service.test-fixture';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';

export function registerCreateCases(fixture: ReturnType<typeof registerProjectsServiceFixture>) {
  describe('create', () => {
    it('creates a project without logo', async () => {
      const payload = { name: 'New', description: 'Desc' } as CreateProjectDto;
      fixture.projectRepository.save.mockImplementationOnce(async (entity: Project) => ({ id: 1, ...entity }));

      const created = await fixture.service.create(2, payload);

      expect(fixture.projectRepository.save).toHaveBeenCalledWith(expect.objectContaining(payload));
      expect(created).toEqual(expect.objectContaining({ id: 1, name: 'New' }));
      expect(fixture.fileStorageService.saveFile).not.toHaveBeenCalled();
      expect(fixture.audit.recordProject).toHaveBeenCalledWith({
        action: 'project.created',
        actorId: 2,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 1,
        details: { projectId: 1, 'after.name': 'New', 'after.hasLogo': 0 },
      });
    });

    it('records a legacy empty project name as omitted instead of dropping the deletion event', async () => {
      fixture.resourceUsageRepository.update.mockResolvedValue({} as never);
      fixture.projectRepository.delete.mockResolvedValueOnce({ affected: 1 } as never);
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce({ id: 99, name: '   ', logo: null } as Project);

      await fixture.service.deleteOne(7, 99);

      expect(fixture.audit.recordProject).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.deleted',
          details: { projectId: 99, 'before.hasLogo': 0, 'before.nameOmitted': 1 },
        }),
      );
    });

    it('stores the logo when provided', async () => {
      const payload = {
        name: 'New',
        description: 'Desc',
        logo: Buffer.from('x') as unknown as FileUpload,
      } as CreateProjectDto;
      fixture.projectRepository.save.mockImplementationOnce(async (entity: Project) => ({ id: 4, ...entity }));
      fixture.fileStorageService.saveFile.mockResolvedValueOnce('logo.png');
      fixture.projectRepository.save.mockImplementationOnce(async (entity: Project) => entity);

      const created = await fixture.service.create(2, payload);

      expect(fixture.fileStorageService.saveFile).toHaveBeenCalledWith(payload.logo, 'projects/4');
      expect(created.logo).toBe('logo.png');
      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ action: 'project.created' }),
      );
      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          action: 'project.updated',
          details: expect.objectContaining({ changedFields: '["logo"]' }),
        }),
      );
    });

    it('records creation before a later logo write fails', async () => {
      const payload = {
        name: 'New',
        description: 'Desc',
        logo: Buffer.from('x') as unknown as FileUpload,
      } as CreateProjectDto;
      fixture.projectRepository.save.mockImplementationOnce(async (entity: Project) => ({ id: 4, ...entity }));
      fixture.fileStorageService.saveFile.mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(fixture.service.create(2, payload)).rejects.toThrow('storage unavailable');

      expect(fixture.audit.recordProject).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.created',
          subjectId: 4,
          details: { projectId: 4, 'after.name': 'New', 'after.hasLogo': 0 },
        }),
      );
    });
  });
}

export function registerFindManyCases(fixture: ReturnType<typeof registerProjectsServiceFixture>) {
  describe('findMany', () => {
    it('returns projects with access metadata', async () => {
      const qb = fixture.createMockQueryBuilder();
      qb.getMany.mockResolvedValueOnce([{ id: 1 } as Project]);
      (fixture.projectRepository.createQueryBuilder as jest.Mock).mockReturnValueOnce(qb);
      fixture.projectAccessService.addAccessMetadata.mockResolvedValueOnce([{ id: 1, access: { isOwner: true } }]);

      const result = await fixture.service.findMany(5, { page: 2, limit: 10 } as FindManyProjectsQueryDto);

      expect(fixture.projectRepository.createQueryBuilder).toHaveBeenCalledWith('project');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('project.owner', 'owner');
      expect(qb.leftJoin).toHaveBeenCalledWith('project.members', 'member', 'member.userId = :userId', { userId: 5 });
      expect(qb.andWhere).toHaveBeenCalledWith('project.archivedAt IS NULL');
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(fixture.projectAccessService.addAccessMetadata).toHaveBeenCalledWith(5, [{ id: 1 }]);
      expect(result).toEqual([{ id: 1, access: { isOwner: true } }]);
    });
  });
}

export function registerFindOneByIdCases(fixture: ReturnType<typeof registerProjectsServiceFixture>) {
  describe('findOneById', () => {
    it('delegates to ProjectAccessService', async () => {
      const project = { id: 9 } as Project;
      fixture.projectAccessService.getAccessOrThrow.mockResolvedValueOnce(project);

      const result = await fixture.service.findOneById(1, 9);

      expect(fixture.projectAccessService.getAccessOrThrow).toHaveBeenCalledWith(1, 9);
      expect(result).toBe(project);
    });
  });
}

export function registerGetTotalCountCases(fixture: ReturnType<typeof registerProjectsServiceFixture>) {
  describe('getTotalCount', () => {
    it('counts accessible projects for the user', async () => {
      const qb = fixture.createMockQueryBuilder();
      qb.getCount.mockResolvedValueOnce(7);
      (fixture.projectRepository.createQueryBuilder as jest.Mock).mockReturnValueOnce(qb);

      const total = await fixture.service.getTotalCount(3);

      expect(fixture.projectRepository.createQueryBuilder).toHaveBeenCalledWith('project');
      expect(qb.leftJoin).toHaveBeenCalledWith('project.owner', 'owner');
      expect(qb.leftJoin).toHaveBeenCalledWith('project.members', 'member', 'member.userId = :userId', { userId: 3 });
      expect(qb.andWhere).toHaveBeenCalledWith('project.archivedAt IS NULL');
      expect(total).toBe(7);
    });
  });
}
