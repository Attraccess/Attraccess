import { useState } from 'react';
import { Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormImageLightbox } from './FormImageLightbox';
import { useAuthenticatedImageUrl } from './useAuthenticatedImageUrl';
import { formImageUrl } from './formImageUrls';
import en from './en.json';
import de from './de.json';

interface FormImageThumbnailProps {
  imageId: string;
  /** 1-based position, for the accessible names. */
  number: number;
  /** Where the thumbnail comes from; defaults to the signed-in user's image endpoint. */
  url?: string;
  /** Opens the full image on press. Off where the thumbnail only previews, e.g. on the phone page. */
  zoomable?: boolean;
}

/** A form image as a small square preview; pressing it opens the image at full size. */
export function FormImageThumbnail({ imageId, number, url, zoomable = true }: Readonly<FormImageThumbnailProps>) {
  const { t } = useTranslations({ en, de });
  const source = url ?? formImageUrl(imageId);
  const { src, isLoading, isError } = useAuthenticatedImageUrl(source);
  const [isOpen, setIsOpen] = useState(false);

  const preview = (
    <span className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-default-200 bg-default-100">
      {isLoading && <Spinner size="sm" color="accent" />}
      {isError && <span className="px-1 text-center text-[10px] text-muted">{t('loadError')}</span>}
      {src && <img src={src} alt={t('alt', { number })} className="size-full object-cover" />}
    </span>
  );

  if (!zoomable) return preview;

  return (
    <>
      <button
        type="button"
        className="rounded-lg"
        aria-label={t('open', { number })}
        disabled={!src}
        onClick={() => setIsOpen(true)}
      >
        {preview}
      </button>
      <FormImageLightbox url={source} label={t('alt', { number })} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
