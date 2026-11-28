import { formImagesUpload } from '@attraccess/react-query-client';
import type { ResourceFormAction } from '../types';
import { ImageCount } from './ImageCount';
import { ImageFieldError } from './ImageFieldError';
import { ImageGallery } from './ImageGallery';
import { ImagePickerButtons } from './ImagePickerButtons';
import { useImageUploads } from './useImageUploads';

interface ImageFieldInputProps {
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  fieldId: number;
  /** The name of the field, for the accessible names of the controls and photos. */
  fieldName: string;
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
  fieldName,
  maxImages,
  ids,
  onChange,
  onBusyChange,
  error,
}: Readonly<ImageFieldInputProps>) {
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

  return (
    <div className="flex flex-col gap-3" data-cy="image-field-input">
      <ImageGallery
        ids={ids}
        fieldName={fieldName}
        pendingCount={pendingCount}
        onRemove={(imageId) => {
          clearProblem();
          onChange((current) => current.filter((id) => id !== imageId));
        }}
      />
      <ImagePickerButtons label={fieldName} multiple={maxImages > 1} isDisabled={isFull} onFiles={addFiles} />
      <ImageCount added={ids.length} max={maxImages} />
      <ImageFieldError error={error} problem={problem} maxImages={maxImages} />
    </div>
  );
}
