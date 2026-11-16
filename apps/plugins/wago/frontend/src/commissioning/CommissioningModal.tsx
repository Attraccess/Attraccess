import { StandardDrawer } from '@attraccess/plugins-frontend-ui';
import { DrawerHeader, DrawerHeading } from '@heroui/react';
import { useWagoTranslations } from '../i18n';
import { CommissioningActions } from './CommissioningActions';
import { CommissioningContent } from './CommissioningContent';
import type { CommissioningModalProps } from './model';
import { useCommissioningState } from './useCommissioningState';

export function CommissioningModal(props: CommissioningModalProps) {
  const { t } = useWagoTranslations();
  const state = useCommissioningState(props);
  return (
    <StandardDrawer
      dialogProps={{ 'aria-label': t('commissioningUI.title') }}
      isOpen={props.isOpen}
      onOpenChange={(open) => !open && state.close()}
    >
      <DrawerHeader>
        <DrawerHeading className="wg:text-xl wg:font-semibold">{t('commissioningUI.title')}</DrawerHeading>
      </DrawerHeader>
      <CommissioningContent state={state} />
      <CommissioningActions state={state} />
    </StandardDrawer>
  );
}
