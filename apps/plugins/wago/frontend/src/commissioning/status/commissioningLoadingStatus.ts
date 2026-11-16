import type { TFunction } from '@attraccess/plugins-frontend-ui';

interface CommissioningOperations {
  recovering: boolean;
  creating: boolean;
  removing: boolean;
  confirming: boolean;
}

export function commissioningLoadingStatus(
  { recovering, creating, removing, confirming }: CommissioningOperations,
  t: TFunction,
): [string, string] | null {
  return recovering
    ? [t('commissioningUI.cleaning'), t('commissioningUI.cleaningDescription')]
    : creating
      ? [t('commissioningUI.preparing'), t('commissioningUI.scanningDescription')]
      : removing
        ? [t('commissioningUI.canceling'), t('commissioningUI.cancelingDescription')]
        : confirming
          ? [t('commissioningUI.confirming'), t('commissioningUI.confirmingDescription')]
          : null;
}
