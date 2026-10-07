import { DocumentationType, ResourceType, SupervisionMode } from '@attraccess/database-entities';
import { CreateResourceDto } from './dtos/createResource.dto';
import { createMockResource } from '../test-utils/resource.fixtures';
import { projectResourceAuditEvent } from '../audit/audit-policy';
import { randomUUID } from 'node:crypto';
import { registerResourcesServiceFixture } from './resources.service.resources-service.test-fixture';
export function registerCreateResourceCases(fixture: ReturnType<typeof registerResourcesServiceFixture>) {
  describe('createResource', () => {
    it('should create a new resource', async () => {
      const createDto: CreateResourceDto = {
        name: 'New Resource',
        type: ResourceType.Machine,
        description: 'New Description',
        documentationType: DocumentationType.MARKDOWN,
        documentationMarkdown: '# New Documentation',
        documentationUrl: null,
        allowTakeOver: false,
        metadata: { location: 'lab-1', maxUsers: 2 },
      };

      const newResource = createMockResource({
        id: 1,
        name: createDto.name,
        description: createDto.description,
        documentationType: createDto.documentationType,
        documentationMarkdown: createDto.documentationMarkdown as string,
        documentationUrl: createDto.documentationUrl,
        imageFilename: null,
        metadata: createDto.metadata ?? null,
      });

      fixture.resourceRepository.create.mockReturnValue(newResource);
      fixture.resourceRepository.save.mockResolvedValue(newResource);

      const result = await fixture.service.createResource(createDto);

      expect(result).toEqual(newResource);
      expect(fixture.resourceRepository.create).toHaveBeenCalledWith({
        name: createDto.name,
        type: createDto.type,
        description: createDto.description,
        documentationType: createDto.documentationType || null,
        documentationMarkdown: createDto.documentationMarkdown || null,
        documentationUrl: createDto.documentationUrl || null,
        allowTakeOver: createDto.allowTakeOver || false,
        separateUnlockAndUnlatch: false,
        metadata: createDto.metadata ?? null,
        retrainingMaxAgeDays: createDto.retrainingMaxAgeDays ?? null,
        retrainingMaxInactivityDays: createDto.retrainingMaxInactivityDays ?? null,
        retrainingBlocksAccess: createDto.retrainingBlocksAccess ?? false,
        supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
        supervisedUsagesUntilIntroduction: null,
        autoIntroductionTarget: null,
        autoIntroductionGroupId: null,
      });
      expect(fixture.resourceRepository.save).toHaveBeenCalled();
    });

    it('audits only the safe resource projection when an actor is available', async () => {
      const resource = createMockResource({ id: 1, name: 'Lathe', type: ResourceType.Machine });
      fixture.resourceRepository.create.mockReturnValue(resource);
      fixture.resourceRepository.save.mockResolvedValue(resource);

      await fixture.service.createResource({ name: 'Lathe', type: ResourceType.Machine }, undefined, { id: 9 });

      expect(fixture.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.created',
          actorId: 9,
          subjectId: 1,
          details: { 'after.name': 'Lathe', 'after.type': ResourceType.Machine },
        }),
      );
    });

    it('bounds an oversized resource name in the audit projection', async () => {
      const resource = createMockResource({ id: 1, name: '"\\\0🙂'.repeat(5000), type: ResourceType.Machine });
      fixture.resourceRepository.create.mockReturnValue(resource);
      fixture.resourceRepository.save.mockResolvedValue(resource);

      await fixture.service.createResource({ name: resource.name, type: ResourceType.Machine }, undefined, { id: 9 });

      const details = fixture.audit.recordResource.mock.calls[0][0].details;
      expect(details['after.name']).toMatch(/\.\.\.$/);
      expect(Buffer.byteLength(JSON.stringify(details), 'utf8')).toBeLessThanOrEqual(4096);
      expect(
        projectResourceAuditEvent({
          ...fixture.audit.recordResource.mock.calls[0][0],
          operationId: randomUUID(),
        }),
      ).not.toBeNull();
    });
  });
}
