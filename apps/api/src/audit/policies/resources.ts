import { ResourceAuditEvent } from './domain-events';
import { dataFields, positive, uuid } from './projection';

export const RESOURCE_AUDIT_ACTIONS: ResourceAuditEvent['action'][] = [
  'resource.created',
  'resource.updated',
  'resource.deleted',
  'resource_group.created',
  'resource_group.updated',
  'resource_group.deleted',
  'resource_group.resource_added',
  'resource_group.resource_removed',
  'introduction.granted',
  'introduction.revoked',
  'maintenance_schedule.created',
  'maintenance_schedule.updated',
  'maintenance_schedule.deleted',
  'supervision.approved',
  'supervision.rejected',
  'health.transition',
  'usage_session.started',
  'usage_session.ended',
  'energy_charge.waived',
  'meter_charge.waived',
  'retraining.required',
  'retraining.cleared',
];
export const resourceActions = new Set<ResourceAuditEvent['action']>(RESOURCE_AUDIT_ACTIONS);
export const resourceDetailFields: Partial<Record<ResourceAuditEvent['action'], readonly string[]>> = {
  'resource.created': ['after.name', 'after.type'],
  'resource.updated': ['before.name', 'after.name', 'before.type', 'after.type', 'changedFields'],
  'resource.deleted': ['before.name', 'before.type'],
  'resource_group.created': ['after.name', 'after.isHidden'],
  'resource_group.updated': ['before.name', 'after.name', 'before.isHidden', 'after.isHidden', 'changedFields'],
  'resource_group.deleted': ['before.name', 'before.isHidden'],
  'resource_group.resource_added': ['resourceId'],
  'resource_group.resource_removed': ['resourceId'],
  'introduction.granted': ['recipientUserId', 'tutorUserId'],
  'introduction.revoked': ['recipientUserId'],
  'maintenance_schedule.created': [
    'scheduleId',
    'enabled',
    'triggerType',
    'name',
    'usageDuration',
    'usageUnit',
    'usageThreshold',
  ],
  'maintenance_schedule.updated': [
    'scheduleId',
    'enabled',
    'triggerType',
    'name',
    'usageDuration',
    'usageUnit',
    'usageThreshold',
  ],
  'maintenance_schedule.deleted': [
    'scheduleId',
    'enabled',
    'triggerType',
    'name',
    'usageDuration',
    'usageUnit',
    'usageThreshold',
  ],
  'supervision.approved': ['requesterUserId', 'supervisorUserId', 'requestId'],
  'supervision.rejected': ['requesterUserId', 'supervisorUserId', 'requestId'],
  'health.transition': ['healthSource', 'previousStatus', 'status'],
  'usage_session.started': ['supervisorUserId', 'usageId', 'usageUserId'],
  'usage_session.ended': ['usageId', 'usageUserId'],
  'energy_charge.waived': ['usageId', 'waivedCredits'],
  'meter_charge.waived': ['meterId', 'usageId', 'waivedCredits'],
  'retraining.required': ['introductionId', 'retrainingReason', 'usageUserId'],
  'retraining.cleared': ['introductionId', 'usageUserId'],
};
export function validResourcePrincipal(input: ResourceAuditEvent): boolean {
  if (input.actorId === null) {
    if (
      (input.authenticationMethod !== undefined && input.authenticationMethod !== null) ||
      (input.apiTokenId !== undefined && input.apiTokenId !== null)
    )
      return false;
  } else if (
    (input.authenticationMethod !== undefined &&
      input.authenticationMethod !== null &&
      input.authenticationMethod !== 'session' &&
      input.authenticationMethod !== 'api-token') ||
    ((input.authenticationMethod === undefined || input.authenticationMethod === null) &&
      input.apiTokenId !== undefined &&
      input.apiTokenId !== null) ||
    (input.apiTokenId !== undefined && input.apiTokenId !== null && !positive(input.apiTokenId)) ||
    (input.authenticationMethod === 'api-token' && (input.apiTokenId === undefined || input.apiTokenId === null))
  ) {
    return false;
  }
  return true;
}

export function projectResourceAuditEvent(input: ResourceAuditEvent): ResourceAuditEvent | null {
  if (
    !resourceActions.has(input.action) ||
    !uuid(input.operationId) ||
    (input.actorId !== null && !positive(input.actorId)) ||
    !positive(input.subjectId) ||
    (input.subjectType !== undefined && input.subjectType !== 'resource' && input.subjectType !== 'resource_group')
  ) {
    return null;
  }
  const allowedFields = resourceDetailFields[input.action];
  if (!allowedFields) return null;
  const details = dataFields(input.details, allowedFields);
  if (!details) return null;
  for (const [key, value] of Object.entries(details)) {
    if (!allowedFields.includes(key) || (typeof value !== 'string' && typeof value !== 'number')) return null;
  }
  if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
  if (!validResourcePrincipal(input)) return null;
  return { ...input, details: details as Record<string, string | number> };
}
