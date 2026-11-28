import { UsageAccessCache } from './authorization/usage-access-cache';
import { UsageAccessRules } from './authorization/usage-access-rules';
import { UsageResourceGate } from './authorization/usage-resource-gate';
import { UsageLifecycle } from './lifecycle/usage-lifecycle';
import { SessionChangeTurns } from './sessions/session-change-turns';
import { UsageDoorActions } from './sessions/usage-door-actions';
import { UsageSessionEnds } from './sessions/usage-session-ends';
import { UsageSessionNotifications } from './sessions/usage-session-notifications';
import { UsageSessionProjectReassign } from './sessions/usage-session-project-reassign';
import { UsageSessionProjectSwitch } from './sessions/usage-session-project-switch';
import { UsageSessionRecords } from './sessions/usage-session-records';
import { UsageSessionStartPreparation } from './sessions/usage-session-start-preparation';
import { UsageSessionStarts } from './sessions/usage-session-starts';
import { UsageSessionExtensions } from './session-duration/usage-session-extensions';

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
  UsageSessionProjectSwitch,
  UsageSessionProjectReassign,
  UsageSessionExtensions,
];
