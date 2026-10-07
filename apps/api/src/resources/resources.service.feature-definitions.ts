import { Resource } from '@attraccess/database-entities';
import { UpdateResourceDto } from './dtos/updateResource.dto';
export const MAX_AUDIT_DETAILS_BYTES = 4096;
export function auditResourceName(name: string, maxJsonBytes: number): string {
  if (Buffer.byteLength(JSON.stringify(name), 'utf8') <= maxJsonBytes) return name;

  const suffix = '...';
  let result = '';
  for (const character of name) {
    if (Buffer.byteLength(JSON.stringify(result + character + suffix), 'utf8') > maxJsonBytes) break;
    result += character;
  }
  return result + suffix;
}
export function auditResourceNames(
  names: Record<string, string>,
  details: Record<string, string>,
): Record<string, string> {
  const emptyNames = Object.fromEntries(Object.keys(names).map((key) => [key, '']));
  const availableBytes =
    MAX_AUDIT_DETAILS_BYTES - Buffer.byteLength(JSON.stringify({ ...details, ...emptyNames }), 'utf8');
  const maxJsonBytes = Math.floor(availableBytes / Object.keys(names).length);
  return Object.fromEntries(Object.entries(names).map(([key, name]) => [key, auditResourceName(name, maxJsonBytes)]));
}
export function resourceAuditSnapshot(resource: Resource) {
  return {
    name: resource.name,
    type: resource.type,
    separateUnlockAndUnlatch: resource.separateUnlockAndUnlatch,
    description: resource.description,
    documentationType: resource.documentationType,
    documentationMarkdown: resource.documentationMarkdown,
    documentationUrl: resource.documentationUrl,
    metadata: resource.metadata,
    imageFilename: resource.imageFilename,
    allowTakeOver: resource.allowTakeOver,
    retrainingMaxAgeDays: resource.retrainingMaxAgeDays,
    retrainingMaxInactivityDays: resource.retrainingMaxInactivityDays,
    retrainingBlocksAccess: resource.retrainingBlocksAccess,
    supervisionMode: resource.supervisionMode,
    supervisedUsagesUntilIntroduction: resource.supervisedUsagesUntilIntroduction,
    autoIntroductionTarget: resource.autoIntroductionTarget,
    autoIntroductionGroupId: resource.autoIntroductionGroupId,
  };
}
export function applyResourceFields(resource: Resource, dto: UpdateResourceDto): void {
  // Update only provided fields
  if (dto.name !== undefined) resource.name = dto.name;
  if (dto.type !== undefined) resource.type = dto.type;
  if (dto.separateUnlockAndUnlatch !== undefined) resource.separateUnlockAndUnlatch = dto.separateUnlockAndUnlatch;
  if (dto.description !== undefined) resource.description = dto.description;
  if (dto.metadata !== undefined) resource.metadata = dto.metadata;

  // Handle documentation fields
  if (dto.documentationType !== undefined) resource.documentationType = dto.documentationType;
  if (dto.documentationMarkdown !== undefined) resource.documentationMarkdown = dto.documentationMarkdown;
  if (dto.documentationUrl !== undefined) resource.documentationUrl = dto.documentationUrl;

  // Handle allowTakeOver field
  if (dto.allowTakeOver !== undefined) resource.allowTakeOver = dto.allowTakeOver;

  if (dto.retrainingMaxAgeDays !== undefined) resource.retrainingMaxAgeDays = dto.retrainingMaxAgeDays;
  if (dto.retrainingMaxInactivityDays !== undefined)
    resource.retrainingMaxInactivityDays = dto.retrainingMaxInactivityDays;
  if (dto.retrainingBlocksAccess !== undefined) resource.retrainingBlocksAccess = dto.retrainingBlocksAccess;

  // Supervision + auto-promotion settings
  if (dto.supervisionMode !== undefined) resource.supervisionMode = dto.supervisionMode;
  if (dto.supervisedUsagesUntilIntroduction !== undefined)
    resource.supervisedUsagesUntilIntroduction = dto.supervisedUsagesUntilIntroduction;
  if (dto.autoIntroductionTarget !== undefined) resource.autoIntroductionTarget = dto.autoIntroductionTarget;
  if (dto.autoIntroductionGroupId !== undefined) resource.autoIntroductionGroupId = dto.autoIntroductionGroupId;
}
export function resourceUpdateAuditDetails(
  before: ReturnType<typeof resourceAuditSnapshot>,
  updatedResource: Resource,
): Record<string, string> {
  const changedFields = [
    ...(before.name !== updatedResource.name ? ['name'] : []),
    ...(before.type !== updatedResource.type ? ['type'] : []),
    ...(before.separateUnlockAndUnlatch !== updatedResource.separateUnlockAndUnlatch
      ? ['separateUnlockAndUnlatch']
      : []),
    ...(before.description !== updatedResource.description ? ['description'] : []),
    ...(before.documentationType !== updatedResource.documentationType ||
    before.documentationMarkdown !== updatedResource.documentationMarkdown ||
    before.documentationUrl !== updatedResource.documentationUrl
      ? ['documentation']
      : []),
    ...(JSON.stringify(before.metadata ?? {}) !== JSON.stringify(updatedResource.metadata ?? {}) ? ['metadata'] : []),
    ...(before.imageFilename !== updatedResource.imageFilename ? ['image'] : []),
    ...(before.allowTakeOver !== updatedResource.allowTakeOver ? ['allowTakeOver'] : []),
    ...(before.retrainingMaxAgeDays !== updatedResource.retrainingMaxAgeDays ? ['retrainingMaxAgeDays'] : []),
    ...(before.retrainingMaxInactivityDays !== updatedResource.retrainingMaxInactivityDays
      ? ['retrainingMaxInactivityDays']
      : []),
    ...(before.retrainingBlocksAccess !== updatedResource.retrainingBlocksAccess ? ['retrainingBlocksAccess'] : []),
    ...(before.supervisionMode !== updatedResource.supervisionMode ? ['supervisionMode'] : []),
    ...(before.supervisedUsagesUntilIntroduction !== updatedResource.supervisedUsagesUntilIntroduction
      ? ['supervisedUsagesUntilIntroduction']
      : []),
    ...(before.autoIntroductionTarget !== updatedResource.autoIntroductionTarget ? ['autoIntroductionTarget'] : []),
    ...(before.autoIntroductionGroupId !== updatedResource.autoIntroductionGroupId ? ['autoIntroductionGroupId'] : []),
  ];
  const details: Record<string, string> = changedFields.length ? { changedFields: JSON.stringify(changedFields) } : {};
  if (before.type !== updatedResource.type) {
    details['before.type'] = before.type;
    details['after.type'] = updatedResource.type;
  }
  if (before.name !== updatedResource.name) {
    Object.assign(
      details,
      auditResourceNames({ 'before.name': before.name, 'after.name': updatedResource.name }, details),
    );
  }
  return details;
}
