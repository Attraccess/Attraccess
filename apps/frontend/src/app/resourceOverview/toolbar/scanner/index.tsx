import { Scanner, IDetectedBarcode, boundingBox } from '@yudiel/react-qr-scanner';
import { useOverlayState } from '@heroui/react';
import { useToastMessage } from '../../../../components/toastProvider';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';

interface Props {
  /** Heading of the scanner dialog; defaults to the resource scanner title. */
  title?: string;
  children: (open: () => void) => React.ReactNode;
}

export function ResourceScanner(props: Props) {
  const { isOpen, open, setOpen } = useOverlayState();

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
        setOpen(false);
      }
    },
    [navigate, frontendOrigin, toast, t, setOpen],
  );

  return (
    <>
      {props.children(open)}
      <StandardModal
        isOpen={isOpen}
        onOpenChange={setOpen}
        size="md"
        dialogProps={{ 'aria-label': props.title ?? t('title') }}
      >
        {() => <Scanner onScan={onScan} components={{ tracker: boundingBox }} />}
      </StandardModal>
    </>
  );
}
