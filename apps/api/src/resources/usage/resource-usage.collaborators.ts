import { UsageAccessCache } from './authorization/usage-access-cache';
import { UsageAccessRules } from './authorization/usage-access-rules';
import { UsageResourceGate } from './authorization/usage-resource-gate';
import { UsageLifecycle } from './lifecycle/usage-lifecycle';
import { SessionChangeTurns } from './sessions/session-change-turns';
import { UsageDoorActions } from './sessions/usage-door-actions';
import { UsageSessionEnds } from './sessions/usage-session-ends';
import { UsageSessionNotifications } from './sessions/usage-session-notifications';
import { UsageSessionRecords } from './sessions/usage-session-records';
import { UsageSessionStartPreparation } from './sessions/usage-session-start-preparation';
import { UsageSessionStarts } from './sessions/usage-session-starts';

/** The collaborators behind ResourceUsageService; registered next to it wherever it is provided for real. */
export const RESOURCE_USAGE_COLLABORATORS = [
  SessionChangeTurns,
  UsageAccessRules,
  UsageAccessCache,
  UsageResourceGate,
  UsageLifecycle,
  UsageSessionRecords,
  UsageSessionNotifications,
  UsageDoorActions,
  UsageSessionStartPreparation,
  UsageSessionEnds,
  UsageSessionStarts,
];
