import { DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading } from '@heroui/react';
import { X } from 'lucide-react';
import { Button } from '../../../../../components/button';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { SupervisedStartModalProps } from './index.supervised-start-modal-props';
import { useSupervisedStartModalState } from './useSupervisedStartModalState';

export function SupervisedStartModal({
  isOpen,
  onClose,
  resourceId,
  requestBody,
  onApproved,
}: Readonly<SupervisedStartModalProps>) {
  const { t, phase, setPhase, renderBody } = useSupervisedStartModalState({
    isOpen,
    onClose,
    resourceId,
    requestBody,
    onApproved,
  });

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <DrawerHeading className="text-lg font-semibold">{t('title')}</DrawerHeading>
          <Button
            isIconOnly
            variant="ghost"
            aria-label={t('cancel')}
            onPress={onClose}
            isDisabled={phase === 'waiting'}
          >
            <X size={16} />
          </Button>
        </div>
      </DrawerHeader>

      <DrawerBody>{renderBody()}</DrawerBody>

      <DrawerFooter>
        {(phase === 'timeout' || phase === 'rejected' || phase === 'error') && (
          <Button variant="primary" onPress={() => setPhase('select')}>
            {t('retry')}
          </Button>
        )}
        <Button variant="ghost" onPress={onClose} isDisabled={phase === 'waiting'}>
          {t('cancel')}
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}

export { type SupervisedStartModalProps } from './index.supervised-start-modal-props';
