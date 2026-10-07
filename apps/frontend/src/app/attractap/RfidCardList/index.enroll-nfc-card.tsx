import { Button, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading } from '@heroui/react';
import { StandardDrawer } from '../../../components/standardDrawer';
import { useCallback, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAttractapServiceEnrollNfcCard } from '@attraccess/react-query-client';
import { AttractapSelect } from '../AttractapSelect';
import { useToastMessage } from '../../../components/toastProvider';
import de from './de.json';
import en from './en.json';
import { XIcon } from 'lucide-react';
import { EnrollNfcCardProps } from './index.enroll-nfc-card-props';

export const EnrollNfcCard = ({ children, userId }: EnrollNfcCardProps) => {
  const { t } = useTranslations({
    de,
    en,
  });

  const [show, setShow] = useState(false);
  const [readerId, setReaderId] = useState<number | null>(null);

  const close = useCallback(() => setShow(false), []);
  const toast = useToastMessage();
  const { mutate: enrollNfcCardMutation, isPending } = useAttractapServiceEnrollNfcCard({
    onSuccess: close,
    onError: (error) => toast.error({ title: t('errorOperation'), description: (error as Error).message }),
  });

  const enrollNfcCard = useCallback(() => {
    if (!readerId) {
      return;
    }

    enrollNfcCardMutation({ requestBody: { readerId, ...(userId !== undefined ? { userId } : {}) } });
  }, [readerId, enrollNfcCardMutation, userId]);

  return (
    <>
      {children(() => setShow(true))}
      <StandardDrawer
        isOpen={show}
        dialogProps={{ 'aria-label': t('enrollModal.title') }}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DrawerHeader>
          <div className="flex w-full items-start justify-between gap-3">
            <DrawerHeading className="text-lg font-semibold">{t('enrollModal.title')}</DrawerHeading>
            <Button isIconOnly variant="ghost" aria-label={t('enrollModal.cancel')} onPress={close}>
              <XIcon size={16} />
            </Button>
          </div>
        </DrawerHeader>
        <DrawerBody>
          <p>{t('enrollModal.description')}</p>
          <AttractapSelect
            label={t('enrollModal.readerLabel')}
            placeholder={t('enrollModal.readerPlaceholder')}
            selection={readerId}
            onSelectionChange={(readerId) => setReaderId(readerId ?? null)}
            data-cy="enroll-nfc-card-modal-reader-select"
            requiredCapabilities={{ cardEnrollment: true }}
          />
        </DrawerBody>
        <DrawerFooter>
          <Button variant="secondary" onPress={close} data-cy="enroll-nfc-card-modal-cancel-button">
            {t('enrollModal.cancel')}
          </Button>
          <Button
            variant="primary"
            isDisabled={!readerId || isPending}
            isPending={isPending}
            onPress={enrollNfcCard}
            data-cy="enroll-nfc-card-modal-enroll-button"
          >
            {t('enrollModal.enroll')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
};
