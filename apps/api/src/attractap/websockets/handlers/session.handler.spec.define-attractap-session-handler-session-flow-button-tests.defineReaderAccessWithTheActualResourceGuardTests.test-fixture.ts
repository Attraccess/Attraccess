/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { ResourceActionGuard } from './resource-action.guard';
import { registerReaderAccessWithTheActualResourceGuardRejectsSWithoutLookingUpOrDisclosingReadings } from './session.handler.reader-access-with-the-actual-resource-guard-rejects-s-without-looking-up-or-disclosing-readings.test-cases';
import { registerReaderAccessWithTheActualResourceGuardAllowsAnAuthenticatedSessionOwnerOnAMappedResource } from './session.handler.reader-access-with-the-actual-resource-guard-allows-an-authenticated-session-owner-on-a-mapped-resource.test-cases';
import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { LiveUsageStatsTestScope } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests';

export function defineReaderAccessWithTheActualResourceGuardTests(parentScope: LiveUsageStatsTestScope) {
  let reader: { id: number; resources: { id: number }[] };
  const scope = inheritTestScope(
    {
      get parentScope() {
        return parentScope;
      },
      get reader() {
        return reader;
      },
      set reader(value: typeof reader) {
        reader = value;
      },
      get request() {
        return parentScope.request;
      },
    },
    parentScope,
  );
  beforeEach(() => {
    reader = { id: 42, resources: [{ id: 10 }] };
    (parentScope.handler as any).resourceActionGuard = Object.assign(new ResourceActionGuard(), {
      attractapService: { findReaderById: jest.fn(async () => reader) },
      usersService: parentScope.mockUsersService,
    });
  });
  registerReaderAccessWithTheActualResourceGuardRejectsSWithoutLookingUpOrDisclosingReadings(scope);
  registerReaderAccessWithTheActualResourceGuardAllowsAnAuthenticatedSessionOwnerOnAMappedResource(scope);

  return scope;
}
