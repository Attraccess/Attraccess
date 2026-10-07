import { registerUpdateResourceShouldUpdateAnExistingResource } from './resources.service.update-resource-should-update-an-existing-resource.test-cases';
import { registerUpdateResourceAuditsChangedSafeFieldsWithoutMetadataOrDocumentation } from './resources.service.update-resource-audits-changed-safe-fields-without-metadata-or-documentation.test-cases';
import { registerUpdateResourceDoesNotAuditMetadataThatOnlyNormalizedFromAbsentToEmpty } from './resources.service.update-resource-does-not-audit-metadata-that-only-normalized-from-absent-to-empty.test-cases';
import { registerUpdateResourceBoundsBothNamesInARenameAuditProjection } from './resources.service.update-resource-bounds-both-names-in-a-rename-audit-projection.test-cases';
import { registerUpdateResourceAuditsANonNameUpdateWithoutRecordingItsValue } from './resources.service.update-resource-audits-a-non-name-update-without-recording-its-value.test-cases';
import { registerUpdateResourceDoesNotAuditAnUnchangedResubmission } from './resources.service.update-resource-does-not-audit-an-unchanged-resubmission.test-cases';
import { registerUpdateResourceAuditsAnImageOnlyUpdateWithoutPersistingTheFilename } from './resources.service.update-resource-audits-an-image-only-update-without-persisting-the-filename.test-cases';
import { registerUpdateResourceShouldThrowResourceNotFoundExceptionIfResourceNotFound } from './resources.service.update-resource-should-throw-resource-not-found-exception-if-resource-not-found.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ResourcesServiceTestScope } from './resources.service.spec';

export function defineUpdateResourceTests(parentScope: ResourcesServiceTestScope) {
  const scope = inheritTestScope(
    {
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get resourceRepository() {
        return parentScope.resourceRepository;
      },
      set resourceRepository(value: typeof parentScope.resourceRepository) {
        parentScope.resourceRepository = value;
      },
      get audit() {
        return parentScope.audit;
      },
      get mockResourceImageService() {
        return parentScope.mockResourceImageService;
      },
    },
    parentScope,
  );
  registerUpdateResourceShouldUpdateAnExistingResource(scope);

  registerUpdateResourceAuditsChangedSafeFieldsWithoutMetadataOrDocumentation(scope);

  registerUpdateResourceDoesNotAuditMetadataThatOnlyNormalizedFromAbsentToEmpty(scope);

  registerUpdateResourceBoundsBothNamesInARenameAuditProjection(scope);

  registerUpdateResourceAuditsANonNameUpdateWithoutRecordingItsValue(scope);

  registerUpdateResourceDoesNotAuditAnUnchangedResubmission(scope);

  registerUpdateResourceAuditsAnImageOnlyUpdateWithoutPersistingTheFilename(scope);

  registerUpdateResourceShouldThrowResourceNotFoundExceptionIfResourceNotFound(scope);

  return scope;
}
