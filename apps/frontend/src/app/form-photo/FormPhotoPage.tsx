import { useParams } from 'react-router-dom';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { AlertStatusIcon, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Loading } from '../loading';
import { FormPhotoReady } from './FormPhotoReady';
import { useFormPhotoPage } from './useFormPhotoPage';
import en from './en.json';
import de from './de.json';

/**
 * The public page behind the QR code of an image field on an Attractap reader. No sign-in: the link is the
 * authorisation, so the page works on any phone that scanned the code.
 */
export function FormPhotoPage() {
  const { token = '' } = useParams();
  const { t } = useTranslations({ en, de });
  const { state, upload, remove } = useFormPhotoPage(token);

  return (
    <main
      className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-4 p-4"
      data-cy="form-photo-page"
    >
      {state.status === 'loading' && <Loading />}
      {state.status === 'expired' && (
        <Alert status="warning" data-cy="form-photo-expired">
          <AlertStatusIcon status="warning" />
          <AlertContent>
            <AlertTitle>{t('expiredTitle')}</AlertTitle>
            <AlertDescription>{t('expired')}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
      {state.status === 'error' && (
        <Alert status="danger">
          <AlertStatusIcon status="danger" />
          <AlertContent>
            <AlertDescription>{t('loadError')}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
      {state.status === 'ready' && <FormPhotoReady token={token} state={state} upload={upload} remove={remove} />}
    </main>
  );
}
