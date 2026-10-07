import { registerUserRegistrationServiceFixture } from './user-registration.service.user-registration-service.test-fixture';
import { registerCreateOneCases } from './user-registration.service.user-registration-service.create-one.test-cases';
import { registerCreateOneWithOverwriteFirstTimeAdminCases } from './user-registration.service.user-registration-service.create-one-with-overwrite-first-time-admin.test-cases';
describe('UserRegistrationService', () => {
  const fixture = registerUserRegistrationServiceFixture();
  registerCreateOneCases(fixture);
  registerCreateOneWithOverwriteFirstTimeAdminCases(fixture);
});
