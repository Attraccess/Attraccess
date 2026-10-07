import { registerPushServiceFixture } from './push.service.push-service.test-fixture';
import { registerGetVapidKeysCases } from './push.service.push-service.get-vapid-keys.test-cases';
import { registerReplaceVapidKeysCases } from './push.service.push-service.replace-vapid-keys.test-cases';
import { registerSendToUserCases } from './push.service.push-service.send-to-user.test-cases';
import { registerUpsertSubscriptionCases } from './push.service.push-service.upsert-subscription.test-cases';
import { registerDeleteSubscriptionCases } from './push.service.push-service.delete-subscription.test-cases';
describe('PushService', () => {
  const fixture = registerPushServiceFixture();
  registerGetVapidKeysCases(fixture);
  registerReplaceVapidKeysCases(fixture);
  registerSendToUserCases(fixture);
  registerUpsertSubscriptionCases(fixture);
  registerDeleteSubscriptionCases(fixture);
});
