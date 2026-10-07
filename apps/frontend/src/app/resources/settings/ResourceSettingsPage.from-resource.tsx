import { Resource, ResourceType, SupervisionMode } from '@attraccess/react-query-client';
import type { FormData } from './ResourceSettingsPage.form-data';

export function fromResource(resource: Resource): FormData {
  return {
    name: resource.name,
    description: resource.description ?? '',
    allowTakeOver: resource.allowTakeOver ?? false,
    type: resource.type ?? ResourceType.MACHINE,
    separateUnlockAndUnlatch: resource.separateUnlockAndUnlatch ?? false,
    retrainingMaxAgeDays: resource.retrainingMaxAgeDays ?? null,
    retrainingMaxInactivityDays: resource.retrainingMaxInactivityDays ?? null,
    retrainingBlocksAccess: resource.retrainingBlocksAccess ?? false,
    supervisionMode: resource.supervisionMode ?? SupervisionMode.INTRODUCTION_REQUIRED,
    supervisedUsagesUntilIntroduction: resource.supervisedUsagesUntilIntroduction ?? null,
    autoIntroductionTarget: resource.autoIntroductionTarget ?? null,
    autoIntroductionGroupId: resource.autoIntroductionGroupId ?? null,
    metadata: (resource.metadata ?? {}) as Record<string, unknown>,
  };
}
