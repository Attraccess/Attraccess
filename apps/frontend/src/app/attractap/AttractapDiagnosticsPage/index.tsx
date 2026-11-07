import { useParams } from 'react-router-dom';
import { PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAttractapServiceGetReaderById } from '@attraccess/react-query-client';
import { AttractapDiagnostics } from '../AttractapEditor/diagnostics/index';
import { NotFound } from '../../not-found';
import de from './de.json';
import en from './en.json';

export function AttractapDiagnosticsPage() {
  const { t } = useTranslations({ de, en });
  const { readerId } = useParams<{ readerId: string }>();
  const id = readerId ? Number(readerId) : undefined;

  const { data: reader, isError } = useAttractapServiceGetReaderById({ readerId: id as number }, undefined, {
    enabled: id !== undefined,
  });

  // A reader that is not paired yet (or does not exist) has no diagnostics: the API answers 404.
  if (isError) return <NotFound />;

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
