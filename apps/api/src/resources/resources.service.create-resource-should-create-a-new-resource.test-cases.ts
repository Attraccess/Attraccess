import { DocumentationType, ResourceType, SupervisionMode } from '@attraccess/database-entities';
import { CreateResourceDto } from './dtos/createResource.dto';
import { createMockResource } from '../test-utils/resource.fixtures';
import { CreateResourceTestScope } from './resources.service.spec';
export function registerCreateResourceShouldCreateANewResource(scope: CreateResourceTestScope): void {
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

    scope.resourceRepository.create.mockReturnValue(newResource);
    scope.resourceRepository.save.mockResolvedValue(newResource);

    const result = await scope.service.createResource(createDto);

    expect(result).toEqual(newResource);
    expect(scope.resourceRepository.create).toHaveBeenCalledWith({
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
    expect(scope.resourceRepository.save).toHaveBeenCalled();
  });
}
