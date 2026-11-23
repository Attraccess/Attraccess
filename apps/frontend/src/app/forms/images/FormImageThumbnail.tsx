import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { ImageOff } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormImageLightbox } from './FormImageLightbox';
import { useAuthenticatedImageUrl } from './useAuthenticatedImageUrl';
import { formImageUrl } from './formImageUrls';
import en from './en.json';
import de from './de.json';

interface FormImageThumbnailProps {
  imageId: string;
  /** 1-based position and the number of images, for the accessible names. */
  number: number;
  total: number;
  /** The name of the field the image answers, for the accessible names. */
  fieldName?: string;
  /** Where the thumbnail comes from; defaults to the signed-in user's image endpoint. */
  url?: string;
  /** Opens the full image on press. Off where the thumbnail only previews, e.g. on the phone page. */
  zoomable?: boolean;
}

/** A form image as a small square preview; pressing it opens the image at full size. */
export function FormImageThumbnail({
  imageId,
  number,
  total,
  fieldName,
  url,
  zoomable = true,
}: Readonly<FormImageThumbnailProps>) {
  const { t } = useTranslations({ en, de });
  const source = url ?? formImageUrl(imageId);
  const { src, isLoading, isError } = useAuthenticatedImageUrl(source);
  const [isOpen, setIsOpen] = useState(false);
  const label = fieldName ? t('altNamed', { field: fieldName, number, total }) : t('alt', { number, total });

  const preview = (
    <span className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-default-200 bg-default-100">
      {isLoading && <Spinner size="sm" color="accent" />}
      {isError && (
        <span role="img" aria-label={t('loadError')} title={t('loadError')} className="text-muted">
          <ImageOff className="size-5" aria-hidden="true" />
        </span>
      )}
      {src && <img src={src} alt={label} className="size-full object-cover" />}
    </span>
  );

  // A photo that cannot be shown (e.g. the viewer may not see it) has nothing to open: a plain tile.
  if (!zoomable || isError) return preview;

  return (
    <>
      <Button
        isIconOnly
        variant="ghost"
        className="size-auto min-w-0 rounded-lg p-0"
        aria-label={t('open', { label })}
        isDisabled={!src}
        onPress={() => setIsOpen(true)}
      >
        {preview}
      </Button>
      <FormImageLightbox url={source} label={label} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
