import { dataFields, positive, uuid } from './projection';

export const RESOURCE_AUDIT_ACTIONS = [
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
  'resource_flow.updated',
  'flow.created',
  'flow.updated',
  'flow.deleted',
  'flow.canvas_updated',
  'flow_variable.set',
  'flow_variable.deleted',
] as const;

export type ResourceAuditAction = (typeof RESOURCE_AUDIT_ACTIONS)[number];

/** Projection input of a resource-domain event. */
export interface ResourceAuditInput {
  action: ResourceAuditAction;
  operationId: string;
  actorId: number | null;
  authenticationMethod?: 'session' | 'api-token' | null;
  apiTokenId?: number | null;
  subjectId: number;
  subjectType?: 'resource' | 'resource_group' | 'flow';
  details: Record<string, string | number>;
}

const CANVAS_FIELDS = [
  'before.nodeCount',
  'after.nodeCount',
  'before.edgeCount',
  'after.edgeCount',
  'addedNodes',
  'removedNodes',
  'changedNodes',
  'addedEdges',
  'removedEdges',
  'addedNodeCount',
  'removedNodeCount',
  'changedNodeCount',
  'addedEdgeCount',
  'removedEdgeCount',
  'before.snapshot',
  'snapshotDetail',
] as const;
const VARIABLE_FIELDS = ['scope', 'key', 'before.value', 'after.value', 'valueType'] as const;

export const resourceActions = new Set<ResourceAuditAction>(RESOURCE_AUDIT_ACTIONS);
export const resourceDetailFields: Partial<Record<ResourceAuditAction, readonly string[]>> = {
  'resource.created': ['after.name', 'after.type'],
  'resource.updated': ['before.name', 'after.name', 'before.type', 'after.type', 'changedFields'],
  'resource.deleted': ['before.name', 'before.type', 'flowNodeCount', 'flowEdgeCount'],
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
  'usage_session.ended': ['usageId', 'usageUserId', 'triggeredByUserId'],
  'energy_charge.waived': ['usageId', 'waivedCredits'],
  'meter_charge.waived': ['meterId', 'usageId', 'waivedCredits'],
  'retraining.required': ['introductionId', 'retrainingReason', 'usageUserId'],
  'retraining.cleared': ['introductionId', 'usageUserId'],
  'resource_flow.updated': CANVAS_FIELDS,
  'flow.created': ['after.name', 'after.enabled', 'after.description'],
  'flow.updated': [
    'before.name',
    'after.name',
    'before.enabled',
    'after.enabled',
    'before.description',
    'after.description',
    'changedFields',
  ],
  'flow.deleted': [
    'before.name',
    'before.enabled',
    'before.nodeCount',
    'before.edgeCount',
    'before.snapshot',
    'snapshotDetail',
  ],
  'flow.canvas_updated': ['flowName', ...CANVAS_FIELDS],
  'flow_variable.set': VARIABLE_FIELDS,
  'flow_variable.deleted': VARIABLE_FIELDS,
};
export function validResourcePrincipal(input: ResourceAuditInput): boolean {
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

/** Global flow events are about a `flow`; resource_group events about a group; everything else about a resource. */
function validSubjectType(input: ResourceAuditInput): boolean {
  if (input.subjectType === undefined) return !input.action.startsWith('flow.');
  if (input.action.startsWith('flow.')) return input.subjectType === 'flow';
  return input.subjectType === 'resource' || input.subjectType === 'resource_group';
}

export function projectResourceAuditEvent(input: ResourceAuditInput): ResourceAuditInput | null {
  if (
    !resourceActions.has(input.action) ||
    !uuid(input.operationId) ||
    (input.actorId !== null && !positive(input.actorId)) ||
    !positive(input.subjectId) ||
    !validSubjectType(input)
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
