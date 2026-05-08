import { Alert, Button, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Modal, ModalContent, useDisclosure } from '../../utils/heroui-compat';
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
  const { isOpen, onOpen, onClose } = useDisclosure();

  const handleConfirm = () => {
    onAccept(COMMUNITY_LICENSE_KEY);
    onClose();
  };

  return (
    <>
      <Button
        variant="flat"
        color="secondary"
        onPress={onOpen}
        isDisabled={isDisabled}
        startContent={<HeartHandshakeIcon size={16} />}
        data-cy={rest['data-cy'] ?? 'community-license-button'}
      >
        {t('button')}
      </Button>
      <Modal isOpen={isOpen} onClose={onClose} scrollBehavior="inside">
        <ModalContent>
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
            <Alert color="warning" variant="flat" description={t('modal.commercialNotice')} />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose} data-cy="community-license-cancel">
              {t('modal.cancel')}
            </Button>
            <Button color="primary" onPress={handleConfirm} data-cy="community-license-confirm">
              {t('modal.confirm')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
