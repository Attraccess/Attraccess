import { registerProjectsServiceFixture } from './projects.service.projects-service.test-fixture';
import { registerFindManyCases } from './projects.service.projects-service.create.behaviors.test-cases';
import { registerGetTotalCountCases } from './projects.service.projects-service.create.behaviors.test-cases';
import { registerFindOneByIdCases } from './projects.service.projects-service.create.behaviors.test-cases';
import { registerCreateCases } from './projects.service.projects-service.create.behaviors.test-cases';
import { registerDeleteOneCases } from './projects.service.projects-service.delete-one.test-cases';
import { registerUpdateOneCases } from './projects.service.projects-service.update-one.test-cases';
import { registerMembershipAndInvitationAuditEventsCases } from './projects.service.projects-service.membership-and-invitation-audit-events.test-cases';
describe('ProjectsService', () => {
  const fixture = registerProjectsServiceFixture();
  registerFindManyCases(fixture);
  registerGetTotalCountCases(fixture);
  registerFindOneByIdCases(fixture);
  registerCreateCases(fixture);
  registerDeleteOneCases(fixture);
  registerUpdateOneCases(fixture);
  registerMembershipAndInvitationAuditEventsCases(fixture);
});
