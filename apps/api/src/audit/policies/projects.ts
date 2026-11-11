import { PROJECT_AUDIT_ACTIONS } from './domains';
import { dataFields, oneOf, positive, uuid } from './projection';
/** Projection input of a project-domain event. */
export interface ProjectAuditInput {
  action: (typeof PROJECT_AUDIT_ACTIONS)[number];
  operationId: string;
  actorId: number;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number;
  subjectType: 'project' | 'project.member' | 'project.invitation';
  subjectId: number;
  details: Record<string, string | number>;
}

export const projectActions = new Set<ProjectAuditInput['action']>(PROJECT_AUDIT_ACTIONS);
export const projectDetailFields = new Set([
  'projectId',
  'memberId',
  'userId',
  'invitationId',
  'role',
  'before.name',
  'after.name',
  'before.nameOmitted',
  'after.nameOmitted',
  'before.nameTruncated',
  'after.nameTruncated',
  'descriptionChanged',
  'changedFields',
  'before.hasLogo',
  'after.hasLogo',
  'after.archived',
]);
export const projectDetailValidators: Record<string, (value: string | number) => boolean> = {
  projectId: positive,
  memberId: positive,
  userId: positive,
  invitationId: positive,
  role: oneOf('viewer'),
  'before.name': (value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 160 && !!value.trim(),
  'after.name': (value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 160 && !!value.trim(),
  'before.nameOmitted': (value) => value === 1,
  'after.nameOmitted': (value) => value === 1,
  'before.nameTruncated': (value) => value === 1,
  'after.nameTruncated': (value) => value === 1,
  descriptionChanged: (value) => value === 1,
  changedFields: (value) => {
    try {
      const fields = JSON.parse(value as string);
      return (
        Array.isArray(fields) &&
        fields.length > 0 &&
        fields.every((field) => ['name', 'description', 'logo'].includes(field))
      );
    } catch {
      return false;
    }
  },
  'before.hasLogo': (value) => value === 0 || value === 1,
  'after.hasLogo': (value) => value === 0 || value === 1,
  'after.archived': (value) => value === 0 || value === 1,
};

/** Project administration snapshots intentionally exclude descriptions, email addresses, and invitation credentials. */
export function projectProjectAuditEvent(input: ProjectAuditInput): ProjectAuditInput | null {
  if (
    !projectActions.has(input.action) ||
    !uuid(input.operationId) ||
    !positive(input.actorId) ||
    !positive(input.subjectId) ||
    !['project', 'project.member', 'project.invitation'].includes(input.subjectType)
  ) {
    return null;
  }
  const authenticationMethod = input.authenticationMethod ?? 'session';
  if (
    (input.authenticationMethod !== undefined &&
      input.authenticationMethod !== 'session' &&
      input.authenticationMethod !== 'api-token') ||
    (authenticationMethod === 'api-token' && !positive(input.apiTokenId)) ||
    (authenticationMethod === 'session' && input.apiTokenId !== undefined)
  ) {
    return null;
  }
  const details = dataFields(input.details, [...projectDetailFields]);
  if (!details) return null;
  for (const [key, value] of Object.entries(details)) {
    if (
      !projectDetailFields.has(key) ||
      (typeof value !== 'string' && typeof value !== 'number') ||
      !projectDetailValidators[key](value)
    ) {
      return null;
    }
  }
  if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
  return { ...input, details: details as Record<string, string | number> };
}
