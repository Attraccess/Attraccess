import { Alert, AlertContent, AlertDescription, Button, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, useOverlayState } from '@heroui/react';
import { HeartHandshakeIcon } from 'lucide-react';
import { I18nTransComponent, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export const COMMUNITY_LICENSE_KEY =
  'I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md';

export const LICENSE_URL = 'https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md';

export interface CommunityLicenseButtonProps {
  onAccept: (licenseKey: string) => void;
  isDisabled?: boolean;
  'data-cy'?: string;
}

export function CommunityLicenseButton({ onAccept, isDisabled, ...rest }: CommunityLicenseButtonProps) {
  const { t } = useTranslations({ en, de });
  const { isOpen, open, close } = useOverlayState();

  const handleConfirm = () => {
    onAccept(COMMUNITY_LICENSE_KEY);
    close();
  };

  return (
    <>
      <Button variant="secondary"
        onPress={open}
        isDisabled={isDisabled}
        startContent={<HeartHandshakeIcon size={16} />}
        data-cy={rest['data-cy'] ?? 'community-license-button'}
      >
        {t('button')}
      </Button>
      <Modal isOpen={isOpen} onOpenChange={(o) => { if (!o) close(); }} scrollBehavior="inside">
        <ModalBackdrop />
        <ModalContainer>
          <ModalDialog>
            {({ close: modalClose }) => (
              <>
                <ModalHeader>{t('modal.title')}</ModalHeader>
                <ModalBody>
                  <p className="text-sm">
                    <I18nTransComponent
                      t={t}
                      i18nKey="modal.question"
                      components={{
                        link: (
                          <a
                            href={LICENSE_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline"
                          >
                            LICENSE.md
                          </a>
                        ),
                      }}
                    />
                  </p>
                  <Alert status="warning" >
                    <AlertContent>
                      <AlertDescription>{t('modal.commercialNotice')}</AlertDescription>
                    </AlertContent>
                  </Alert>
                </ModalBody>
                <ModalFooter>
                  <Button variant="ghost" onPress={modalClose} data-cy="community-license-cancel">
                    {t('modal.cancel')}
                  </Button>
                  <Button variant="primary" onPress={handleConfirm} data-cy="community-license-confirm">
                    {t('modal.confirm')}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
      </Modal>
    </>
  );
}
