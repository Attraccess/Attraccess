import { registerResourceIntroducersServiceFixture } from './resourceIntroducers.service.resource-introducers-service.test-fixture';
import { registerGetManyCases } from './resourceIntroducers.service.resource-introducers-service.can-maintain.behaviors.test-cases';
import { registerGetManyForResourcesCases } from './resourceIntroducers.service.resource-introducers-service.can-maintain.behaviors.test-cases';
import { registerIsIntroducerCases } from './resourceIntroducers.service.resource-introducers-service.can-maintain.behaviors.test-cases';
import { registerCanMaintainCases } from './resourceIntroducers.service.resource-introducers-service.can-maintain.behaviors.test-cases';
import { registerGrantCases } from './resourceIntroducers.service.resource-introducers-service.grant.test-cases';
import { registerRevokeCases } from './resourceIntroducers.service.resource-introducers-service.can-maintain.behaviors.test-cases';
describe('ResourceIntroducersService', () => {
  const fixture = registerResourceIntroducersServiceFixture();
  registerGetManyCases(fixture);
  registerGetManyForResourcesCases(fixture);
  registerIsIntroducerCases(fixture);
  registerCanMaintainCases(fixture);
  registerGrantCases(fixture);
  registerRevokeCases(fixture);
});
