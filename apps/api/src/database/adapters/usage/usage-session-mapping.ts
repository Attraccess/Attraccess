import type {
  UsageFormAnswer,
  UsageLifecycleAttempt,
  UsageSession,
  UsageSessionForm,
  UsageSessionFormSubmission,
} from '@attraccess/application-models';
import type { Form, FormSubmission, ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { toTransactionRecord } from '../billing/billing-mappers';
import { toProjectRecord } from '../projects/project-mapping';
import { toResourceRecord } from '../resources/resource-mapping';
import { toUserContact, toUserProfile } from '../users/user-mapping';

/**
 * Maps a loaded relation: absent when the read did not load it, null when it was loaded and has no row. Keeping the
 * two apart keeps the JSON of a session as it was (an unloaded relation is no key, a missing row is `null`).
 */
function relation<T, R>(value: T | null | undefined, map: (row: T) => R): R | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : map(value);
}

/** Copies only the keys whose value is defined, so an unloaded relation stays absent. */
function withDefined<T extends object>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

export function toUsageSessionForm(form: Form): UsageSessionForm {
  return {
    id: form.id,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
    name: form.name,
    scope: form.scope,
    isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
    isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
    isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
    resourceId: form.resourceId,
    groupId: form.groupId,
    deletedAt: form.deletedAt,
  };
}

export function toUsageFormSubmission(submission: FormSubmission): UsageSessionFormSubmission {
  return withDefined({
    id: submission.id,
    formId: submission.formId,
    data: submission.data as Record<string, UsageFormAnswer>,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    userId: submission.userId,
    resourceUsageId: submission.resourceUsageId,
    action: submission.action,
    form: submission.form === undefined ? undefined : toUsageSessionForm(submission.form),
    user: relation(submission.user, toUserProfile),
  });
}

/**
 * A usage row as the neutral session, field by field. Users are mapped to their profile (the session's own user also
 * keeps the mail address flows and notifications need); no token or lock-state column is copied.
 */
export function toUsageSession(row: ResourceUsage): UsageSession {
  return withDefined({
    id: row.id,
    usageAction: row.usageAction,
    resourceId: row.resourceId,
    userId: row.userId,
    startTime: row.startTime,
    startNotes: row.startNotes,
    endTime: row.endTime,
    endNotes: row.endNotes,
    usageInMinutes: row.usageInMinutes,
    projectId: row.projectId,
    isFinalized: row.isFinalized,
    lifecyclePending: row.lifecyclePending,
    supervisorUserId: row.supervisorUserId,
    sessionDurationCreditsPerMinute: row.sessionDurationCreditsPerMinute,
    operatingDurationCreditsPerMinute: row.operatingDurationCreditsPerMinute,
    creditsPerUsage: row.creditsPerUsage,
    billingFactor: row.billingFactor,
    meterRates: row.meterRates,
    attributedOperatingDurationInMinutes: row.attributedOperatingDurationInMinutes,
    resource: row.resource === undefined ? undefined : toResourceRecord(row.resource),
    user: relation(row.user, toUserContact),
    project: relation(row.project, toProjectRecord),
    supervisorUser: relation(row.supervisorUser, toUserProfile),
    formSubmissions: row.formSubmissions?.map(toUsageFormSubmission),
    billingTransaction: relation(row.billingTransaction, toTransactionRecord),
  });
}

export function toUsageLifecycleAttempt(row: ResourceUsageLifecycleAttempt): UsageLifecycleAttempt {
  return withDefined({
    id: row.id,
    resourceId: row.resourceId,
    kind: row.kind,
    candidateUsageId: row.candidateUsageId,
    previousUsageId: row.previousUsageId,
    transitionTime: row.transitionTime,
    formSubmissions: row.formSubmissions as unknown as UsageLifecycleAttempt['formSubmissions'],
    billingItems: row.billingItems,
    createdAt: row.createdAt,
  });
}
