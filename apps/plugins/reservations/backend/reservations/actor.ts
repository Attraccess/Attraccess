import type { PluginAccessPrincipal, PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';

/**
 * Who performs an operation. Request-driven actors (built by `principalOf`) carry the request's effective
 * permissions, which core narrows to the token's scope for API-token requests; every access check applies them.
 * Background work (scheduler, event handlers) passes actors without them and acts with the user's full RBAC
 * permissions.
 */
export interface ReservationActor extends PluginAuditPrincipal {
  effectivePermissions?: ReadonlySet<string>;
}

/** Subject of an access check: a request actor (scope applies) or a plain user id (full permissions). */
export type AccessSubject = number | ReservationActor;

export function subjectUserId(subject: AccessSubject): number {
  return typeof subject === 'number' ? subject : subject.userId;
}

/** The `resourceAccess` principal for a subject: request actors keep their scope, plain ids resolve full RBAC. */
export function accessPrincipal(subject: AccessSubject): PluginAccessPrincipal {
  if (typeof subject === 'number') return subject;
  if (subject.effectivePermissions === undefined) return subject.userId;
  return { id: subject.userId, effectivePermissions: subject.effectivePermissions };
}

/** Only the audit fields of an actor (never forwards permissions to the audit store). */
export function auditPrincipal(actor: PluginAuditPrincipal): PluginAuditPrincipal {
  return {
    userId: actor.userId,
    authenticationMethod: actor.authenticationMethod,
    ...(actor.apiTokenId !== undefined ? { apiTokenId: actor.apiTokenId } : {}),
  };
}
