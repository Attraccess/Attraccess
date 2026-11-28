import { Spinner } from '@heroui/react';
import { Button, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useFindManyProjects } from '@attraccess/react-query-client';
import en from './switchProject/en.json';
import de from './switchProject/de.json';

/** Says why the projects to switch to are not there (yet); renders nothing once they are. */
export function ProjectListStatus() {
  const { t } = useTranslations({ en, de });
  const { data, isLoading, isError, refetch } = useFindManyProjects({ query: {} });

  if (data) return null;
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner size="sm" />
        {t('projects.loading')}
      </div>
    );
  }
  if (!isError) return null;
  return (
    <StatusAlert status="danger" title={t('projects.loadError')}>
      <Button size="sm" variant="secondary" onPress={() => void refetch()}>
        {t('projects.retry')}
      </Button>
    </StatusAlert>
  );
}
