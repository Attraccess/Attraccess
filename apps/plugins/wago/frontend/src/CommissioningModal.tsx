import { DrawerHeader, DrawerHeading } from '@heroui/react';
import { StandardDrawer } from './drawer';
import { useWagoTranslations } from './i18n';
import { CommissioningModalProps } from './CommissioningModal.commissioning-modal-props';
import { useCommissioningInputs } from './useCommissioningInputs';
import { useCommissioningClose } from './useCommissioningClose';
import { useCommissioningOutput } from './useCommissioningOutput';
import { CommissioningContent } from './CommissioningContent';
import { CommissioningActions } from './CommissioningActions';

function useCommissioning({ isOpen, session: resumedSession, onOpenChange, onConfigure }: CommissioningModalProps) {
  const useCommissioningInputsModel = useCommissioningInputs({
    isOpen,
    session: resumedSession,
    onOpenChange,
    onConfigure,
  });
  const useCommissioningCloseModel = useCommissioningClose(useCommissioningInputsModel);
  return useCommissioningOutput(useCommissioningCloseModel);
}

export type CommissioningModel = ReturnType<typeof useCommissioning>;

export function CommissioningModal(props: CommissioningModalProps) {
  const { t } = useWagoTranslations();
  const model = useCommissioning(props);
  return (
    <StandardDrawer
      ariaLabel={t('commissioningUI.title')}
      isOpen={props.isOpen}
      onOpenChange={(open) => !open && model.close()}
    >
      <DrawerHeader>
        <DrawerHeading className="wg:text-xl wg:font-semibold">{t('commissioningUI.title')}</DrawerHeading>
      </DrawerHeader>
      <CommissioningContent model={model} />
      <CommissioningActions model={model} />
    </StandardDrawer>
  );
}
