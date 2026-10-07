import { DocumentationType, ResourceType } from '@attraccess/database-entities';
import { UpdateResourceDto } from './dtos/updateResource.dto';
import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';
import { createMockResource } from '../test-utils/resource.fixtures';
import { projectResourceAuditEvent } from '../audit/audit-policy';
import { randomUUID } from 'node:crypto';
import { registerResourcesServiceFixture } from './resources.service.resources-service.test-fixture';
export function registerUpdateResourceCases(fixture: ReturnType<typeof registerResourcesServiceFixture>) {
  describe('updateResource', () => {
    it('should update an existing resource', async () => {
      const resourceId = 1;
      const updateDto: UpdateResourceDto = {
        name: 'Updated Resource',
        type: ResourceType.Machine,
        description: 'Updated Description',
        documentationType: DocumentationType.URL,
        documentationUrl: 'https://example.com/updated',
        metadata: { template: 'default', area: 'A2' },
      };

      const existingResource = createMockResource({
        id: resourceId,
        name: 'Old Resource',
        description: 'Old Description',
        documentationType: DocumentationType.MARKDOWN,
        documentationMarkdown: '# Old Documentation',
        documentationUrl: null,
        imageFilename: null,
      });

      const updatedResource = createMockResource({
        id: resourceId,
        name: updateDto.name,
        description: updateDto.description,
        documentationType: updateDto.documentationType,
        documentationMarkdown: null,
        documentationUrl: updateDto.documentationUrl,
        imageFilename: null,
        maintenances: [],
        metadata: updateDto.metadata ?? null,
      });

      jest.spyOn(fixture.service, 'getResourceById').mockResolvedValue(existingResource);
      fixture.resourceRepository.save.mockResolvedValue(updatedResource);

      const result = await fixture.service.updateResource(resourceId, updateDto);

      expect(result).toEqual(updatedResource);
      expect(fixture.service.getResourceById).toHaveBeenCalledWith(resourceId);
      expect(fixture.resourceRepository.save).toHaveBeenCalled();
    });

    it('audits changed safe fields without metadata or documentation', async () => {
      const existingResource = createMockResource({ id: 1, name: 'Old', type: ResourceType.Lock });
      const updatedResource = createMockResource({ id: 1, name: 'New', type: ResourceType.Machine });
      updatedResource.metadata = { password: 'secret' };
      jest.spyOn(fixture.service, 'getResourceById').mockResolvedValue(existingResource);
      fixture.resourceRepository.save.mockResolvedValue(updatedResource);

      await fixture.service.updateResource(
        1,
        { name: 'New', type: ResourceType.Machine, metadata: { password: 'secret' } },
        undefined,
        { id: 9 },
      );

      expect(fixture.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.updated',
          details: {
            'before.name': 'Old',
            'after.name': 'New',
            'before.type': ResourceType.Lock,
            'after.type': ResourceType.Machine,
            changedFields: '["name","type","metadata"]',
          },
        }),
      );
    });

    it('does not audit metadata that only normalized from absent to empty', async () => {
      const existingResource = createMockResource({ id: 1, name: 'Old', metadata: null });
      const updatedResource = createMockResource({ id: 1, name: 'New', metadata: {} });
      jest.spyOn(fixture.service, 'getResourceById').mockResolvedValue(existingResource);
      fixture.resourceRepository.save.mockResolvedValue(updatedResource);

      await fixture.service.updateResource(1, { name: 'New', metadata: {} }, undefined, { id: 9 });

      expect(fixture.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.updated',
          details: { 'before.name': 'Old', 'after.name': 'New', changedFields: '["name"]' },
        }),
      );
    });

    it('bounds both names in a rename audit projection', async () => {
      const existingResource = createMockResource({ id: 1, name: '"'.repeat(5000) });
      const updatedResource = createMockResource({ id: 1, name: '\\'.repeat(5000) + '🚪'.repeat(5000) });
      jest.spyOn(fixture.service, 'getResourceById').mockResolvedValue(existingResource);
      fixture.resourceRepository.save.mockResolvedValue(updatedResource);

      await fixture.service.updateResource(1, { name: updatedResource.name }, undefined, { id: 9 });

      const details = fixture.audit.recordResource.mock.calls[0][0].details;
      expect(Buffer.byteLength(JSON.stringify(details), 'utf8')).toBeLessThanOrEqual(4096);
      expect(
        projectResourceAuditEvent({
          ...fixture.audit.recordResource.mock.calls[0][0],
          operationId: randomUUID(),
        }),
      ).not.toBeNull();
    });

    it('audits a non-name update without recording its value', async () => {
      const existingResource = createMockResource({ id: 1, allowTakeOver: false });
      const updatedResource = createMockResource({ id: 1, allowTakeOver: true });
      jest.spyOn(fixture.service, 'getResourceById').mockResolvedValue(existingResource);
      fixture.resourceRepository.save.mockResolvedValue(updatedResource);

      await fixture.service.updateResource(1, { allowTakeOver: true }, undefined, { id: 9 });

      expect(fixture.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.updated',
          details: { changedFields: '["allowTakeOver"]' },
        }),
      );
    });

    it('does not audit an unchanged resubmission', async () => {
      const resource = createMockResource({ id: 1, allowTakeOver: false });
      jest.spyOn(fixture.service, 'getResourceById').mockResolvedValue(resource);
      fixture.resourceRepository.save.mockResolvedValue(resource);

      await fixture.service.updateResource(1, { allowTakeOver: false }, undefined, { id: 9 });

      expect(fixture.audit.recordResource).not.toHaveBeenCalled();
    });

    it('audits an image-only update without persisting the filename', async () => {
      const resource = createMockResource({ id: 1, imageFilename: null });
      const updatedResource = createMockResource({ id: 1, imageFilename: 'resource-1.png' });
      jest.spyOn(fixture.service, 'getResourceById').mockResolvedValue(resource);
      fixture.mockResourceImageService.saveImage.mockResolvedValue('resource-1.png');
      fixture.resourceRepository.save.mockResolvedValue(updatedResource);

      await fixture.service.updateResource(1, {}, {} as never, { id: 9 });

      expect(fixture.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.updated',
          details: { changedFields: '["image"]' },
        }),
      );
    });

    it('should throw ResourceNotFoundException if resource not found', async () => {
      const resourceId = 999;
      const updateDto: UpdateResourceDto = {
        name: 'Updated Resource',
        type: ResourceType.Machine,
      };

      jest.spyOn(fixture.service, 'getResourceById').mockRejectedValue(new ResourceNotFoundException(resourceId));

      await expect(fixture.service.updateResource(resourceId, updateDto)).rejects.toThrow(ResourceNotFoundException);
    });
  });
}
