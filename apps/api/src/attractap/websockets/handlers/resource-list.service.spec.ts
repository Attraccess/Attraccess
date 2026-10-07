import { registerResourceListServiceFixture } from './resource-list.service.resource-list-service.test-fixture';
import { registerSendResourceListCases } from './resource-list.service.resource-list-service.send-resource-list-to-readers-with-resources.behaviors.test-cases';
import { registerPerResourceCardAccessCases } from './resource-list.service.resource-list-service.per-resource-card-access.test-cases';
import { registerSendResourceListToReadersWithResourcesCases } from './resource-list.service.resource-list-service.send-resource-list-to-readers-with-resources.behaviors.test-cases';
import { registerSendResourceListToSocketCases } from './resource-list.service.resource-list-service.send-resource-list-to-socket.test-cases';
describe('ResourceListService', () => {
  const fixture = registerResourceListServiceFixture();
  registerSendResourceListCases(fixture);
  registerPerResourceCardAccessCases(fixture);
  registerSendResourceListToReadersWithResourcesCases(fixture);
  registerSendResourceListToSocketCases(fixture);
});
