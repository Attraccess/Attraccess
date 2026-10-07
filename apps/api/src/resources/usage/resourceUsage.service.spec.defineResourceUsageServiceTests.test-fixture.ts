import { registerResourceUsageServiceAssignsAndClearsACompletedSessionProjectThroughTheOwningUser } from './resourceUsage.service.resource-usage-service-assigns-and-clears-a-completed-session-project-through-the-owning-user.test-cases';
import { registerResourceUsageServiceRejectsInvalidOrUnauthorizedProjectAssignmentsWithoutWritingTheSession } from './resourceUsage.service.resource-usage-service-rejects-invalid-or-unauthorized-project-assignments-without-writing-the-session.test-cases';
import { resetTestFixture } from './resourceUsage.service.setup.test-fixture';
import { mockRbacService } from './resourceUsage.service.spec.mock-rbac-service';
import { createResourceUsageServiceFixture } from './resourceUsage.service.spec.createResourceUsageServiceFixture.test-fixture';
import { defineEndSessionTests } from './resourceUsage.service.spec.defineEndSessionTests.test-fixture';
import { defineStartSessionTests } from './resourceUsage.service.spec.defineStartSessionTests.test-fixture';
import { defineCanControllResourceCacheTests } from './resourceUsage.service.spec.defineCanControllResourceCacheTests.test-fixture';
import { defineSupervisedStartTests } from './resourceUsage.service.spec.defineSupervisedStartTests.test-fixture';
import { defineDoorActionsTests } from './resourceUsage.service.spec.defineDoorActionsTests.test-fixture';
import { defineGetSessionDetailsTests } from './resourceUsage.service.spec.defineGetSessionDetailsTests.test-fixture';
import { defineGetActiveSessionTests } from './resourceUsage.service.spec.defineGetActiveSessionTests.test-fixture';

export function defineResourceUsageServiceTests() {
  // Expose transactional entity manager for assertions
  const scope = createResourceUsageServiceFixture();
  beforeEach(async () => {
    await resetTestFixture(scope);
  });
  afterEach(() => {
    jest.clearAllMocks();
    mockRbacService.getEffectivePermissions.mockResolvedValue(new Set<string>());
  });

  registerResourceUsageServiceAssignsAndClearsACompletedSessionProjectThroughTheOwningUser(scope);

  registerResourceUsageServiceRejectsInvalidOrUnauthorizedProjectAssignmentsWithoutWritingTheSession(scope);

  describe('getSessionDetails', () => {
    defineGetSessionDetailsTests(scope);
  });

  describe('startSession', () => {
    defineStartSessionTests(scope);
  });

  describe('supervised start', () => {
    defineSupervisedStartTests(scope);
  });

  describe('getActiveSession', () => {
    defineGetActiveSessionTests(scope);
  });

  describe('endSession', () => {
    defineEndSessionTests(scope);
  });

  describe('door actions', () => {
    defineDoorActionsTests(scope);
  });

  describe('canControllResource (cache)', () => {
    defineCanControllResourceCacheTests(scope);
  });

  return scope;
}
