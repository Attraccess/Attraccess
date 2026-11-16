import { useParams } from 'react-router-dom';
import { PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAttractapServiceGetReaderById } from '@attraccess/react-query-client';
import { DEFAULT_RETRIES } from '../../../api/queryClient';
import { AttractapDiagnostics } from '../AttractapEditor/diagnostics/index';
import { NotFound } from '../../not-found';
import de from './de.json';
import en from './en.json';

const statusOf = (error: unknown) => (error as { status?: number } | null)?.status;

/** A 404 or 403 does not change by asking again; other failures are retried as usual. */
export const retryReaderLookup = (failureCount: number, error: unknown) =>
  statusOf(error) !== 404 && statusOf(error) !== 403 && failureCount < DEFAULT_RETRIES;

export function AttractapDiagnosticsPage() {
  const { t } = useTranslations({ de, en });
  const { readerId } = useParams<{ readerId: string }>();
  const id = readerId ? Number(readerId) : undefined;

  const { data: reader, error } = useAttractapServiceGetReaderById({ readerId: id as number }, undefined, {
    enabled: id !== undefined,
    retry: retryReaderLookup,
  });

  // A reader that is not paired yet (or does not exist) has no diagnostics: the API answers 404.
  // Other failures keep the page; the diagnostics below show their own error.
  if (statusOf(error) === 404) return <NotFound />;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { name: reader?.name ?? '' })}
        backTo="/attractap/readers"
      />
      <AttractapDiagnostics readerId={id} />
    </>
  );
}
