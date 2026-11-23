import { useParams } from 'react-router-dom';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
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
    <div className="flex flex-col gap-4" data-cy="form-photo-page">
      {state.status === 'loading' && <Loading />}
      {state.status === 'expired' && (
        <StatusAlert status="warning" title={t('expiredTitle')} data-cy="form-photo-expired">
          {t('expired')}
        </StatusAlert>
      )}
      {state.status === 'error' && (
        <StatusAlert status="danger" title={t('loadErrorTitle')} data-cy="form-photo-error">
          {t('loadError')}
        </StatusAlert>
      )}
      {state.status === 'ready' && <FormPhotoReady token={token} state={state} upload={upload} remove={remove} />}
    </div>
  );
}
