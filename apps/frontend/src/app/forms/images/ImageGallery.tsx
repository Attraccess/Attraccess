import { Button, Spinner } from '@heroui/react';
import { X } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormImageThumbnail } from './FormImageThumbnail';
import en from './en.json';
import de from './de.json';

interface ImageGalleryProps {
  ids: string[];
  /** Uploads still running, shown as spinners after the images. */
  pendingCount?: number;
  /** Where the thumbnails come from; the signed-in image endpoint when missing. */
  urlFor?: (imageId: string) => string;
  zoomable?: boolean;
  onRemove: (imageId: string) => void;
}

/** The images of a field being filled in, each with a remove button. */
export function ImageGallery({ ids, pendingCount = 0, urlFor, zoomable, onRemove }: Readonly<ImageGalleryProps>) {
  const { t } = useTranslations({ en, de });
  if (!ids.length && !pendingCount) return null;
  return (
    <div className="flex flex-wrap gap-3" data-cy="image-gallery">
      {ids.map((id, index) => (
        <div key={id} className="relative">
          <FormImageThumbnail imageId={id} number={index + 1} url={urlFor?.(id)} zoomable={zoomable} />
          <Button
            isIconOnly
            size="sm"
            variant="danger-soft"
            className="absolute -right-2 -top-2 size-6 min-w-6 rounded-full"
            aria-label={t('remove', { number: index + 1 })}
            onPress={() => onRemove(id)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
      {Array.from({ length: pendingCount }, (_, index) => (
        <span
          key={`pending-${index}`}
          role="status"
          aria-label={t('uploading')}
          className="flex size-16 items-center justify-center rounded-lg border border-default-200 bg-default-100"
        >
          <Spinner size="sm" color="accent" />
        </span>
      ))}
    </div>
  );
}
