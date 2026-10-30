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
  /**
   * Takes over scanned content instead of navigating to it. Return true when it was handled; the
   * scanner then closes. Return false to show an "unknown QR code" notice and keep scanning.
   */
  onDetected?: (rawValue: string) => boolean;
}

export function ResourceScanner(props: Props) {
  const { isOpen, open, setOpen } = useOverlayState();

  const navigate = useNavigate();
  const toast = useToastMessage();
  const { t } = useTranslations({ de, en });

  const frontendOrigin = window.location.origin;

  const { onDetected } = props;
  const onScan = useCallback(
    (codes: IDetectedBarcode[]) => {
      const rawValue = codes[0]?.rawValue;
      if (!rawValue) return;

      const showUnknown = () =>
        toast.error({ title: t('scan.error.unknown.title'), description: t('scan.error.unknown.description') });

      if (onDetected) {
        if (onDetected(rawValue)) setOpen(false);
        else showUnknown();
        return;
      }

      let url: URL;
      try {
        url = new URL(rawValue);
      } catch {
        showUnknown();
        return;
      }

      if (url.origin !== frontendOrigin) {
        toast.error({
          title: t('scan.error.wrongOrigin.title'),
          description: t('scan.error.wrongOrigin.description'),
        });
        return;
      }

      navigate(url.pathname + url.search + url.hash);
      setOpen(false);
    },
    [navigate, frontendOrigin, toast, t, setOpen, onDetected],
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
