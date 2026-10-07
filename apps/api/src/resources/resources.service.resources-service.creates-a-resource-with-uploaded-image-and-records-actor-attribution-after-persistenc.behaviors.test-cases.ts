import { ResourceType } from '@attraccess/database-entities';
import { CreateResourceDto } from './dtos/createResource.dto';
import { createMockResource } from '../test-utils/resource.fixtures';
import { registerResourcesServiceFixture } from './resources.service.resources-service.test-fixture';
import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';
import { projectResourceAuditEvent } from '../audit/audit-policy';
import { randomUUID } from 'node:crypto';

export function registerCreatesAResourceWithUploadedImageAndRecordsActorAttributionAfterPersistencCases(
  fixture: ReturnType<typeof registerResourcesServiceFixture>,
) {
  it('creates a resource with uploaded image and records actor attribution after persistence', async () => {
    const resource = createMockResource({ id: 8, name: 'Lathe', type: ResourceType.Machine });
    fixture.resourceRepository.count.mockResolvedValue(2);
    fixture.resourceRepository.create.mockReturnValue(resource);
    fixture.resourceRepository.save.mockResolvedValue(resource);
    fixture.mockResourceImageService.saveImage.mockResolvedValue('image.webp');
    const file = { buffer: Buffer.from('image') };
    const result = await fixture.service.createResource(
      { name: 'Lathe', type: ResourceType.Machine } as CreateResourceDto,
      file as never,
      { id: 7, authenticationMethod: 'api-token', apiTokenId: 9 },
    );
    expect(result.imageFilename).toBe('image.webp');
    expect(fixture.mockResourceImageService.saveImage).toHaveBeenCalledWith(8, file);
    expect(fixture.resourceRepository.save).toHaveBeenCalledTimes(2);
    expect(fixture.audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'resource.created', actorId: 7, apiTokenId: 9, subjectId: 8 }),
    );
  });
}

export function registerDeleteResourceCases(fixture: ReturnType<typeof registerResourcesServiceFixture>) {
  describe('deleteResource', () => {
    it('should delete a resource', async () => {
      (fixture.resourceRepository.softDelete as jest.Mock).mockResolvedValue({
        affected: 1,
        raw: {},
        generatedMaps: [],
      });

      await fixture.service.deleteResource(1);

      expect(fixture.resourceRepository.softDelete).toHaveBeenCalledWith(1);
    });

    it('audits deletion with the pre-delete safe projection', async () => {
      const resource = createMockResource({ id: 1, name: 'Lathe', type: ResourceType.Machine });
      jest.spyOn(fixture.service, 'getResourceById').mockResolvedValue(resource);
      fixture.resourceRepository.softDelete.mockResolvedValue({ affected: 1 } as never);

      await fixture.service.deleteResource(1, { id: 9 });

      expect(fixture.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.deleted',
          actorId: 9,
          details: { 'before.name': 'Lathe', 'before.type': ResourceType.Machine },
        }),
      );
    });

    it('bounds an oversized resource name in a deletion audit projection', async () => {
      const resource = createMockResource({
        id: 1,
        name: '\0'.repeat(5000) + '🙂'.repeat(5000),
        type: ResourceType.Machine,
      });
      jest.spyOn(fixture.service, 'getResourceById').mockResolvedValue(resource);
      fixture.resourceRepository.softDelete.mockResolvedValue({ affected: 1 } as never);

      await fixture.service.deleteResource(1, { id: 9 });

      const details = fixture.audit.recordResource.mock.calls[0][0].details;
      expect(details['before.name']).toMatch(/\.\.\.$/);
      expect(Buffer.byteLength(JSON.stringify(details), 'utf8')).toBeLessThanOrEqual(4096);
      expect(
        projectResourceAuditEvent({
          ...fixture.audit.recordResource.mock.calls[0][0],
          operationId: randomUUID(),
        }),
      ).not.toBeNull();
    });

    it('should throw ResourceNotFoundException if resource not found', async () => {
      (fixture.resourceRepository.softDelete as jest.Mock).mockResolvedValue({
        affected: 0,
        raw: {},
        generatedMaps: [],
      });

      await expect(fixture.service.deleteResource(999)).rejects.toThrow(ResourceNotFoundException);
    });
  });
}

export function registerGetResourceByIdCases(fixture: ReturnType<typeof registerResourcesServiceFixture>) {
  describe('getResourceById', () => {
    it('should return a resource by id', async () => {
      const mockResource = createMockResource({
        id: 1,
        name: 'Resource 1',
        description: 'Description 1',
        documentationMarkdown: '# Documentation 1',
      });

      fixture.resourceRepository.find.mockResolvedValue([mockResource]);

      const result = await fixture.service.getResourceById(1);

      expect(result).toEqual(mockResource);
      expect(fixture.resourceRepository.find).toHaveBeenCalledWith({
        where: { id: expect.anything() },
        relations: ['introductions', 'usages', 'groups'],
      });
    });

    it('should throw ResourceNotFoundException if resource not found', async () => {
      fixture.resourceRepository.find.mockResolvedValue([]);

      await expect(fixture.service.getResourceById(999)).rejects.toThrow(ResourceNotFoundException);
    });
  });
}

export function registerRemovesTheNewResourceIfPersistingItsImageFilenameFailsCases(
  fixture: ReturnType<typeof registerResourcesServiceFixture>,
) {
  it('removes the new resource if persisting its image filename fails', async () => {
    const resource = createMockResource({ id: 8 });
    fixture.resourceRepository.count.mockResolvedValue(2);
    fixture.resourceRepository.create.mockReturnValue(resource);
    fixture.resourceRepository.save
      .mockResolvedValueOnce(resource)
      .mockRejectedValueOnce(new Error('image metadata write failed'));
    fixture.mockResourceImageService.saveImage.mockResolvedValue('image.webp');
    await expect(
      fixture.service.createResource(
        { name: 'Lathe', type: ResourceType.Machine } as CreateResourceDto,
        { buffer: Buffer.from('image') } as never,
      ),
    ).rejects.toThrow('image metadata write failed');
    expect(fixture.resourceRepository.delete).toHaveBeenCalledWith(8);
    expect(fixture.audit.recordResource).not.toHaveBeenCalled();
  });
}

export function registerShouldBeDefinedCases(fixture: ReturnType<typeof registerResourcesServiceFixture>) {
  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });
}
