import { Alert, AlertContent, AlertDescription, Card } from '@heroui/react';
import { AlertStatusIcon, useTranslations } from '@attraccess/plugins-frontend-ui';
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
  const { pendingCount, problem, addFiles } = useImageUploads({
    upload,
    onUploaded: () => undefined,
    remaining: uploadsRemaining,
  });
  const canAdd = !isUsedUp && uploadsRemaining - pendingCount > 0;

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
          pendingCount={pendingCount}
          urlFor={(imageId) => formPhotoImageUrl(token, imageId)}
          zoomable={false}
          onRemove={(imageId) => void remove(imageId)}
        />
        {canAdd && <ImagePickerButtons multiple={uploadsRemaining > 1} onFiles={addFiles} />}
        <p className="text-xs text-default-400">
          {t('remaining', { count: Math.max(0, uploadsRemaining - pendingCount) })}
        </p>
        {problem && (
          <p className="text-sm font-medium text-danger" role="alert">
            {problem === 'max' ? t('maxReached') : t('uploadError')}
          </p>
        )}
        {(images.length > 0 || isUsedUp) && (
          <Alert status="success">
            <AlertStatusIcon status="success" />
            <AlertContent>
              <AlertDescription>{isUsedUp ? t('doneUsedUp') : t('done')}</AlertDescription>
            </AlertContent>
          </Alert>
        )}
      </Card.Content>
    </Card>
  );
}
