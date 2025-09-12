import { Modal, ModalContent, useDisclosure } from '@heroui/react';
import { Scanner, IDetectedBarcode, boundingBox } from '@yudiel/react-qr-scanner';
import { useToastMessage } from '../../../../components/toastProvider';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';

interface Props {
  children: (open: () => void) => React.ReactNode;
}

export function ResourceScanner(props: Props) {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const navigate = useNavigate();
  const toast = useToastMessage();
  const { t } = useTranslations({ de, en });

  const frontendOrigin = window.location.origin;

  const onScan = useCallback(
    (codes: IDetectedBarcode[]) => {
      for (const code of codes) {
        const url = new URL(code.rawValue);

        if (url.origin !== frontendOrigin) {
          toast.error({
            title: t('scan.error.wrongOrigin.title'),
            description: t('scan.error.wrongOrigin.description'),
          });
          return;
        }

        navigate(url.pathname + url.search + url.hash);
      }
    },
    [navigate, frontendOrigin, toast, t],
  );

  return (
    <>
      {props.children(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          <Scanner onScan={onScan} components={{ tracker: boundingBox }} />
        </ModalContent>
      </Modal>
    </>
  );
}
