export interface ResourceAuditEvent {
  action:
    | 'resource.created'
    | 'resource.updated'
    | 'resource.deleted'
    | 'resource_group.created'
    | 'resource_group.updated'
    | 'resource_group.deleted'
    | 'resource_group.resource_added'
    | 'resource_group.resource_removed'
    | 'introduction.granted'
    | 'introduction.revoked'
    | 'maintenance_schedule.created'
    | 'maintenance_schedule.updated'
    | 'maintenance_schedule.deleted'
    | 'supervision.approved'
    | 'supervision.rejected'
    | 'health.transition'
    | 'usage_session.started'
    | 'usage_session.ended'
    | 'energy_charge.waived'
    | 'retraining.required'
    | 'retraining.cleared';
  operationId: string;
  actorId: number | null;
  authenticationMethod?: 'session' | 'api-token' | null;
  apiTokenId?: number | null;
  subjectId: number;
  subjectType?: 'resource' | 'resource_group';
  details: Record<string, string | number>;
}

export interface ProjectAuditEvent {
  action:
    | 'project.created'
    | 'project.updated'
    | 'project.deleted'
    | 'project.archived'
    | 'project.unarchived'
    | 'project.member.added'
    | 'project.member.removed'
    | 'project.invitation.sent'
    | 'project.invitation.accepted'
    | 'project.invitation.rejected'
    | 'project.invitation.revoked';
  operationId: string;
  actorId: number;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number;
  subjectType: 'project' | 'project.member' | 'project.invitation';
  subjectId: number;
  details: Record<string, string | number>;
}

export interface AttractapAuditEvent {
  action: 'reader.registered' | 'reader.deregistered' | 'card.linked' | 'card.unlinked' | 'reader.crash_reported';
  actorId: number | null;
  authenticationMethod: 'session' | 'api-token' | null;
  apiTokenId?: number;
  subjectId: number;
  details: Record<string, string | number | boolean>;
}

export type ResourceAuditOrigin =
  | { actorId: number; authenticationMethod: 'session' | 'api-token'; apiTokenId?: number }
  | { actorId: number; authenticationMethod: null }
  | { actorId: null };

export type SsoAuditEvent = {
  action: string;
  operationId: string;
  actorId: number | null;
  authenticationMethod: 'session' | 'api-token' | null;
  apiTokenId?: number;
  subject: { type: 'sso.provider' | 'user'; id: number };
  details: Record<string, string>;
};
