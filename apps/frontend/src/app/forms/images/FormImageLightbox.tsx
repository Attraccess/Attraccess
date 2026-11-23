import { ModalBody, ModalCloseTrigger, ModalHeader } from '@heroui/react';
import { Spinner } from '@heroui/react';
import { StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuthenticatedImageUrl } from './useAuthenticatedImageUrl';
import en from './en.json';
import de from './de.json';

interface FormImageLightboxProps {
  url: string;
  label: string;
  isOpen: boolean;
  onClose: () => void;
}

/** One form image at full size. */
export function FormImageLightbox({ url, label, isOpen, onClose }: Readonly<FormImageLightboxProps>) {
  const { t } = useTranslations({ en, de });
  // Only loaded while open, so a list of thumbnails does not fetch every full image.
  const { src, isLoading, isError } = useAuthenticatedImageUrl(isOpen ? url : null);

  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      dialogProps={{ 'aria-label': label }}
    >
      <ModalHeader className="flex justify-end">
        <ModalCloseTrigger aria-label={t('close')} />
      </ModalHeader>
      <ModalBody className="items-center">
        {isLoading && <Spinner color="accent" />}
        {isError && <p className="text-sm text-danger">{t('loadError')}</p>}
        {src && <img src={src} alt={label} className="max-h-[80vh] max-w-full rounded-lg object-contain" />}
      </ModalBody>
    </StandardModal>
  );
}
