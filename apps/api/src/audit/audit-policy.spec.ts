import { randomUUID } from 'node:crypto';
import {
  projectAttractapAuditEvent,
  projectIdentityAuditEvent,
  projectProjectAuditEvent,
  projectResourceAuditEvent,
} from './audit-policy';

describe('audit storage safe snapshot', () => {
  it('allows only reviewed resource fields, including safe resource administration projections', () => {
    const resourceEvent = {
      action: 'maintenance_schedule.created' as const,
      operationId: randomUUID(),
      actorId: 42,
      subjectId: 7,
      details: { scheduleId: 3, enabled: 1, triggerType: 'usage_count', usageThreshold: 12 },
    };
    expect(projectResourceAuditEvent(resourceEvent)).toEqual(resourceEvent);
    expect(projectResourceAuditEvent({ ...resourceEvent, details: { password: 'raw-secret' } })).toBeNull();
    const deletion = {
      action: 'resource.deleted' as const,
      operationId: randomUUID(),
      actorId: 42,
      subjectId: 7,
      details: { 'before.name': 'Lathe', 'before.type': 'machine' },
    };
    expect(projectResourceAuditEvent(deletion)).toEqual(deletion);
    expect(projectResourceAuditEvent({ ...deletion, details: { password: 'raw-secret' } })).toBeNull();
  });

  it('allows the flow events with their reviewed fields and subject types only', () => {
    const base = { operationId: randomUUID(), actorId: 42, subjectId: 7 };
    const canvas = {
      'before.nodeCount': 2,
      'after.nodeCount': 0,
      removedNodes: '[{"id":"a","type":"t"}]',
      snapshotDetail: 'full',
    };
    const resourceFlow = {
      ...base,
      action: 'resource_flow.updated' as const,
      subjectType: 'resource' as const,
      details: canvas,
    };
    expect(projectResourceAuditEvent(resourceFlow)).toEqual(resourceFlow);
    expect(projectResourceAuditEvent({ ...resourceFlow, subjectType: 'flow' })).toBeNull();
    expect(
      projectResourceAuditEvent({ ...resourceFlow, details: { ...canvas, flowName: 'Not for resource flows' } }),
    ).toBeNull();
    expect(projectResourceAuditEvent({ ...resourceFlow, details: { ...canvas, secret: 'x' } })).toBeNull();
    expect(
      projectResourceAuditEvent({ ...resourceFlow, details: { ...canvas, addedNodes: ['a'] as never } }),
    ).toBeNull();

    const globalFlow = {
      ...base,
      action: 'flow.canvas_updated' as const,
      subjectType: 'flow' as const,
      details: { ...canvas, flowName: 'Door bell' },
    };
    expect(projectResourceAuditEvent(globalFlow)).toEqual(globalFlow);
    expect(projectResourceAuditEvent({ ...globalFlow, subjectType: 'resource' })).toBeNull();
    expect(projectResourceAuditEvent({ ...globalFlow, subjectType: undefined })).toBeNull();

    for (const action of ['flow.created', 'flow.updated', 'flow.deleted'] as const) {
      expect(projectResourceAuditEvent({ ...base, action, subjectType: 'flow', details: {} })).not.toBeNull();
    }
    const variable = {
      ...base,
      action: 'flow_variable.set' as const,
      subjectType: 'resource' as const,
      details: { scope: 'global', key: 'mode', valueType: 'string', 'after.value': '"on"' },
    };
    expect(projectResourceAuditEvent(variable)).toEqual(variable);
    expect(projectResourceAuditEvent({ ...variable, subjectType: 'flow' })).toBeNull();
    expect(projectResourceAuditEvent({ ...variable, subjectType: 'resource_group' })).toBeNull();
    expect(projectResourceAuditEvent({ ...variable, subjectType: undefined })).toBeNull();
    expect(projectResourceAuditEvent({ ...variable, details: { ...variable.details, 'before.name': 'x' } })).toBeNull();
    expect(
      projectResourceAuditEvent({
        action: 'resource.deleted',
        ...base,
        details: { 'before.name': 'Lathe', 'before.type': 'machine', flowNodeCount: 3, flowEdgeCount: 2 },
      }),
    ).not.toBeNull();
  });

  it('rejects flow metadata fields outside each event and flow events about a resource', () => {
    const base = { operationId: randomUUID(), actorId: 42, subjectId: 7, subjectType: 'flow' as const };
    const valid = {
      'flow.created': { 'after.name': 'Door bell', 'after.enabled': 1, 'after.description': 'rings' },
      'flow.updated': { flowName: 'Door bell', 'before.enabled': 1, 'after.enabled': 0, changedFields: '["enabled"]' },
      'flow.deleted': {
        'before.name': 'Door bell',
        'before.enabled': 1,
        'before.snapshot': '{}',
        snapshotDetail: 'full',
      },
    } as const;
    const foreign = {
      'flow.created': { 'before.snapshot': '{}' },
      'flow.updated': { 'before.snapshot': '{}' },
      'flow.deleted': { flowName: 'Door bell' },
    } as const;
    for (const action of ['flow.created', 'flow.updated', 'flow.deleted'] as const) {
      const event = { ...base, action, details: valid[action] };
      expect(projectResourceAuditEvent(event)).toEqual(event);
      expect(projectResourceAuditEvent({ ...event, details: { ...valid[action], ...foreign[action] } })).toBeNull();
      expect(projectResourceAuditEvent({ ...event, subjectType: 'resource' })).toBeNull();
    }
  });

  it('accepts a deleted flow variable about a resource and resource flow saves about a resource only', () => {
    const base = { operationId: randomUUID(), actorId: 42, subjectId: 7 };
    const deleted = {
      ...base,
      action: 'flow_variable.deleted' as const,
      subjectType: 'resource' as const,
      details: { scope: 'resource', key: 'mode', valueType: 'string', 'before.value': '"on"' },
    };
    expect(projectResourceAuditEvent(deleted)).toEqual(deleted);
    expect(projectResourceAuditEvent({ ...deleted, subjectType: 'flow' })).toBeNull();

    const saved = {
      ...base,
      action: 'resource_flow.updated' as const,
      subjectType: 'resource' as const,
      details: { 'before.nodeCount': 0, 'after.nodeCount': 1, snapshotDetail: 'full' },
    };
    expect(projectResourceAuditEvent(saved)).toEqual(saved);
    expect(projectResourceAuditEvent({ ...saved, subjectType: 'resource_group' })).toBeNull();
    expect(projectResourceAuditEvent({ ...saved, subjectType: undefined })).toBeNull();
  });

  it('accepts generated role keys truncated after a separator', () => {
    expect(
      projectIdentityAuditEvent({
        action: 'role_created',
        operationId: randomUUID(),
        outcome: 'succeeded',
        subjectType: 'identity.role',
        subjectId: 1,
        details: { role: `${'a'.repeat(79)}-` },
      }),
    ).toMatchObject({ details: { role: `${'a'.repeat(79)}-` } });
  });

  it('accepts truncated generated role keys inside password-policy override snapshots', () => {
    const role = `${'a'.repeat(79)}-`;
    expect(
      projectIdentityAuditEvent({
        action: 'password_policy_override_updated',
        operationId: randomUUID(),
        outcome: 'succeeded',
        subjectType: 'identity.password_policy',
        subjectId: 1,
        details: {
          role,
          before: JSON.stringify({ role, minLength: 10 }),
          after: JSON.stringify({ role, minLength: 12 }),
          field: 'minLength',
        },
      }),
    ).toMatchObject({ details: { role, field: 'minLength' } });
  });

  it('allows only firmware reset reasons in Attractap crash events', () => {
    const crash = {
      action: 'reader.crash_reported' as const,
      actorId: null,
      authenticationMethod: null,
      subjectId: 7,
      details: { source: 'reader-websocket', resetReason: 'PANIC', hasCoredump: false },
    };
    expect(projectAttractapAuditEvent(crash)).toEqual(crash);
    expect(
      projectAttractapAuditEvent({ ...crash, details: { ...crash.details, resetReason: 'raw-secret' } }),
    ).toBeNull();
  });

  it('allows system-origin lifecycle events but rejects mixed origins', () => {
    const resourceEvent = {
      action: 'usage_session.ended' as const,
      operationId: randomUUID(),
      actorId: null,
      subjectId: 7,
      details: { usageId: 3, usageUserId: 42 },
    };
    expect(projectResourceAuditEvent(resourceEvent)).toEqual(resourceEvent);
    expect(projectResourceAuditEvent({ ...resourceEvent, authenticationMethod: 'session' })).toBeNull();
    expect(projectResourceAuditEvent({ ...resourceEvent, apiTokenId: 4 })).toBeNull();
  });

  it('allows explicitly system-originated introductions without synthesizing a user session', () => {
    const event = {
      action: 'introduction.granted' as const,
      operationId: randomUUID(),
      actorId: null,
      authenticationMethod: null,
      subjectId: 7,
      details: { recipientUserId: 3, tutorUserId: 9 },
    };

    expect(projectResourceAuditEvent(event)).toEqual(event);
    expect(projectResourceAuditEvent({ ...event, authenticationMethod: 'session' })).toBeNull();
  });

  it('allows only safe project administration snapshots', () => {
    const projectEvent = {
      action: 'project.invitation.sent' as const,
      operationId: randomUUID(),
      actorId: 42,
      subjectType: 'project.invitation' as const,
      subjectId: 7,
      details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
    };
    expect(projectProjectAuditEvent(projectEvent)).toEqual(projectEvent);
    expect(projectProjectAuditEvent({ ...projectEvent, details: { email: 'person@example.test' } })).toBeNull();
    expect(projectProjectAuditEvent({ ...projectEvent, details: { projectId: 0 } })).toBeNull();
    expect(projectProjectAuditEvent({ ...projectEvent, details: { role: 'administrator' } })).toBeNull();
    expect(projectProjectAuditEvent({ ...projectEvent, details: { hasLogo: 2 } })).toBeNull();
    expect(projectProjectAuditEvent({ ...projectEvent, details: { changedFields: 'logo' } })).toBeNull();
    expect(projectProjectAuditEvent({ ...projectEvent, authenticationMethod: 'api-token' })).toBeNull();
    expect(projectProjectAuditEvent({ ...projectEvent, authenticationMethod: 'other' } as never)).toBeNull();
    expect(projectProjectAuditEvent({ ...projectEvent, authenticationMethod: 'session', apiTokenId: 9 })).toBeNull();
    expect(projectProjectAuditEvent({ ...projectEvent, apiTokenId: 9 })).toBeNull();
    expect(projectProjectAuditEvent({ ...projectEvent, authenticationMethod: 'api-token', apiTokenId: 9 })).toEqual(
      expect.objectContaining({ authenticationMethod: 'api-token', apiTokenId: 9 }),
    );
    expect(projectProjectAuditEvent({ ...projectEvent, details: { 'after.nameOmitted': 1 } })).toEqual(
      expect.objectContaining({ details: { 'after.nameOmitted': 1 } }),
    );
    expect(projectProjectAuditEvent({ ...projectEvent, action: 'project.invitation.resent' as never })).toBeNull();
  });
});
