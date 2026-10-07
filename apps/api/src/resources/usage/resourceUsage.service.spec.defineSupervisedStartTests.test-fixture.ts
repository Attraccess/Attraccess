import { registerSupervisedStartStartsASupervisedSessionSetsSupervisorUserIdAndEmitsTheAutoPromotionCounterEvent } from './resourceUsage.service.supervised-start-starts-a-supervised-session-sets-supervisor-user-id-and-emits-the-auto-promotion-counter-event.test-cases';
import { registerSupervisedStartRejectsAResourceManagerWhoIsNotAlsoAnIntroducer } from './resourceUsage.service.supervised-start-rejects-a-resource-manager-who-is-not-also-an-introducer.test-cases';
import { registerSupervisedStartAllowsASupervisedStartOnSupervisionRequiredEvenForAnIntroducedUser } from './resourceUsage.service.supervised-start-allows-a-supervised-start-on-supervision-required-even-for-an-introduced-user.test-cases';
import { registerSupervisedStartRejectsSelfSupervision } from './resourceUsage.service.supervised-start-rejects-self-supervision.test-cases';
import { registerSupervisedStartRejectsAMaintainerWhoIsNotAlsoAnIntroducer } from './resourceUsage.service.supervised-start-rejects-a-maintainer-who-is-not-also-an-introducer.test-cases';
import { registerSupervisedStartAcceptsAnApplicableResourceGroupIntroducer } from './resourceUsage.service.supervised-start-accepts-an-applicable-resource-group-introducer.test-cases';
import { registerSupervisedStartRejectsASupervisedStartWhenTheResourceDoesNotAllowSupervision } from './resourceUsage.service.supervised-start-rejects-a-supervised-start-when-the-resource-does-not-allow-supervision.test-cases';
import { registerSupervisedStartRejectsAnUnknownSupervisor } from './resourceUsage.service.supervised-start-rejects-an-unknown-supervisor.test-cases';
import { registerSupervisedStartBlocksASoloStartOnSupervisionRequiredEvenForAnIntroducedUser } from './resourceUsage.service.supervised-start-blocks-a-solo-start-on-supervision-required-even-for-an-introduced-user.test-cases';
import { createSupervisedStartFixture } from './resourceUsage.service.spec.createSupervisedStartFixture.test-fixture';
import { ResourceUsageServiceTestScope } from './resourceUsage.service.spec';

export function defineSupervisedStartTests(parentScope: ResourceUsageServiceTestScope) {
  const scope = createSupervisedStartFixture(parentScope);

  registerSupervisedStartStartsASupervisedSessionSetsSupervisorUserIdAndEmitsTheAutoPromotionCounterEvent(scope);

  registerSupervisedStartRejectsAResourceManagerWhoIsNotAlsoAnIntroducer(scope);

  registerSupervisedStartAllowsASupervisedStartOnSupervisionRequiredEvenForAnIntroducedUser(scope);

  registerSupervisedStartRejectsSelfSupervision(scope);

  registerSupervisedStartRejectsAMaintainerWhoIsNotAlsoAnIntroducer(scope);

  registerSupervisedStartAcceptsAnApplicableResourceGroupIntroducer(scope);

  registerSupervisedStartRejectsASupervisedStartWhenTheResourceDoesNotAllowSupervision(scope);

  registerSupervisedStartRejectsAnUnknownSupervisor(scope);

  registerSupervisedStartBlocksASoloStartOnSupervisionRequiredEvenForAnIntroducedUser(scope);

  return scope;
}
