import { TFunction } from '@attraccess/plugins-frontend-ui';
import { CommissioningModel } from './CommissioningModal';

export function commissioningLoadingStatus(
  {
    recoverSessionMutation,
    createSessionMutation,
    removeSessionMutation,
    confirmHostKeyMutation,
  }: Pick<
    CommissioningModel,
    'recoverSessionMutation' | 'createSessionMutation' | 'removeSessionMutation' | 'confirmHostKeyMutation'
  >,
  t: TFunction,
): [string, string] | null {
  return recoverSessionMutation.isPending
    ? [t('commissioningUI.cleaning'), t('commissioningUI.cleaningDescription')]
    : createSessionMutation.isPending
      ? [t('commissioningUI.preparing'), t('commissioningUI.scanningDescription')]
      : removeSessionMutation.isPending
        ? [t('commissioningUI.canceling'), t('commissioningUI.cancelingDescription')]
        : confirmHostKeyMutation.isPending
          ? [t('commissioningUI.confirming'), t('commissioningUI.confirmingDescription')]
          : null;
}
