import { useParams } from 'react-router-dom';
import { Card } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAttractapServiceGetReaderById } from '@attraccess/react-query-client';
import { PageHeader } from '../../../components/pageHeader';
import { AttractapDiagnostics } from '../AttractapEditor/AttractapDiagnostics';
import de from './de.json';
import en from './en.json';

export function AttractapDiagnosticsPage() {
  const { t } = useTranslations({ de, en });
  const { readerId } = useParams<{ readerId: string }>();
  const id = readerId ? Number(readerId) : undefined;

  const { data: reader } = useAttractapServiceGetReaderById({ readerId: id as number }, undefined, {
    enabled: id !== undefined,
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { name: reader?.name ?? '' })}
        backTo="/attractap/readers"
      />
      <Card>
        <Card.Content>
          <AttractapDiagnostics readerId={id} />
        </Card.Content>
      </Card>
    </>
  );
}
