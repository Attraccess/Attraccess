import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { formImagesUpload } from '@attraccess/react-query-client';
import { ImageGallery } from './ImageGallery';
import { ImagePickerButtons } from './ImagePickerButtons';
import { useImageUploads } from './useImageUploads';
import en from './en.json';
import de from './de.json';

interface ImageFieldInputProps {
  resourceId: number;
  action: 'start' | 'takeover' | 'end';
  formId: number;
  fieldId: number;
  maxImages: number;
  /** The ids of the images added so far: the answer of the field. */
  ids: string[];
  /** Takes an updater, because uploads finish one after another and must not overwrite each other. */
  onChange: (update: (ids: string[]) => string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  error?: string | null;
}

/**
 * The image field of a form being filled in: each picked photo uploads at once and shows as a thumbnail. Removing one
 * only drops it from the answer; the server deletes the unused file later.
 */
export function ImageFieldInput({
  resourceId,
  action,
  formId,
  fieldId,
  maxImages,
  ids,
  onChange,
  onBusyChange,
  error,
}: Readonly<ImageFieldInputProps>) {
  const { t } = useTranslations({ en, de });
  const { pendingCount, problem, addFiles, clearProblem } = useImageUploads({
    upload: async (file) => {
      const { data } = await formImagesUpload({
        path: { resourceId, formId, fieldId },
        query: { action },
        body: { image: file },
        throwOnError: true,
      });
      return data.id;
    },
    onUploaded: (imageId) => onChange((current) => (current.includes(imageId) ? current : [...current, imageId])),
    remaining: maxImages - ids.length,
    onBusyChange,
  });
  const isFull = ids.length + pendingCount >= maxImages;
  const message =
    error ??
    (problem === 'upload' ? t('uploadError') : problem === 'max' ? t('maxReached', { count: maxImages }) : null);

  return (
    <div className="flex flex-col gap-3" data-cy="image-field-input">
      <ImageGallery
        ids={ids}
        pendingCount={pendingCount}
        onRemove={(imageId) => {
          clearProblem();
          onChange((current) => current.filter((id) => id !== imageId));
        }}
      />
      <ImagePickerButtons multiple={maxImages > 1} isDisabled={isFull} onFiles={addFiles} />
      <p className="text-xs text-default-400">{t('count', { count: ids.length, max: maxImages })}</p>
      {message && (
        <p className="flex items-start gap-1 text-sm font-medium text-danger" role="alert">
          <span aria-hidden="true">⚠</span>
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}
