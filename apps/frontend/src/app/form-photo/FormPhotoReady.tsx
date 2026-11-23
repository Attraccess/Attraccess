import { useState } from 'react';
import { Card } from '@heroui/react';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ImageCount } from '../forms/images/ImageCount';
import { ImageFieldError } from '../forms/images/ImageFieldError';
import { ImageGallery } from '../forms/images/ImageGallery';
import { ImagePickerButtons } from '../forms/images/ImagePickerButtons';
import { formPhotoImageUrl } from '../forms/images/formImageUrls';
import { useImageUploads } from '../forms/images/useImageUploads';
import en from './en.json';
import de from './de.json';
import type { FormPhotoState } from './useFormPhotoPage';

interface FormPhotoReadyProps {
  token: string;
  state: Extract<FormPhotoState, { status: 'ready' }>;
  upload: (file: File) => Promise<string>;
  remove: (imageId: string) => Promise<void>;
}

/** The controls of a valid link: what the form asks for, the photos so far, and where to add more. */
export function FormPhotoReady({ token, state, upload, remove }: Readonly<FormPhotoReadyProps>) {
  const { t } = useTranslations({ en, de });
  const { page, images, uploadsRemaining, isUsedUp } = state;
  const { pendingCount, problem, addFiles, clearProblem } = useImageUploads({ upload, remaining: uploadsRemaining });
  const [removeFailed, setRemoveFailed] = useState(false);
  const canAdd = !isUsedUp && uploadsRemaining - pendingCount > 0;

  const handleRemove = async (imageId: string) => {
    clearProblem();
    setRemoveFailed(false);
    try {
      await remove(imageId);
    } catch {
      setRemoveFailed(true);
    }
  };

  return (
    <Card>
      <Card.Header>
        <Card.Title>{page.fieldName}</Card.Title>
        <Card.Description>
          {t('context', { resource: page.resourceName, form: page.formName })}
          {page.fieldDescription ? ` · ${page.fieldDescription}` : ''}
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <ImageGallery
          ids={images}
          fieldName={page.fieldName}
          pendingCount={pendingCount}
          urlFor={(imageId) => formPhotoImageUrl(token, imageId)}
          zoomable={false}
          onRemove={(imageId) => void handleRemove(imageId)}
        />
        {canAdd && <ImagePickerButtons label={page.fieldName} multiple={uploadsRemaining > 1} onFiles={addFiles} />}
        <ImageCount added={images.length} max={page.maxImages} />
        {!isUsedUp && (
          <p className="text-xs text-default-400">
            {t('remaining', { count: Math.max(0, uploadsRemaining - pendingCount) })}
          </p>
        )}
        <ImageFieldError error={removeFailed ? t('removeError') : null} problem={problem} maxImages={page.maxImages} />
        {(images.length > 0 || isUsedUp) && (
          <StatusAlert status="success">{isUsedUp ? t('doneUsedUp') : t('done')}</StatusAlert>
        )}
      </Card.Content>
    </Card>
  );
}
