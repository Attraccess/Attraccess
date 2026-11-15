import { Button, Link, Spinner } from '@heroui/react';
import { LayoutDashboardIcon } from 'lucide-react';
import { PageHeader, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { RootRedirect } from '../routes/RootRedirect';
import { DashboardGrid } from './DashboardGrid';
import { useDashboardPins } from './pins';
import de from './de.json';
import en from './en.json';

function LoadingDashboard() {
  return (
    <div className="flex justify-center py-12">
      <Spinner color="accent" data-cy="dashboard-loading" />
    </div>
  );
}

function DashboardContent() {
  const { t } = useTranslations({ en, de });
  const { data: pins, isPending, isError, refetch, isRefetching } = useDashboardPins();

  if (isPending) return <LoadingDashboard />;

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3" data-cy="dashboard-load-error">
        <StatusAlert status="danger" title={t('loadError.title')}>
          {t('loadError.description')}
        </StatusAlert>
        <Button variant="secondary" onPress={() => void refetch()} isPending={isRefetching}>
          {t('loadError.retry')}
        </Button>
      </div>
    );
  }

  if (pins.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center" data-cy="dashboard-empty">
        <LayoutDashboardIcon className="w-10 h-10 text-muted" aria-hidden />
        <h2 className="text-lg font-semibold">{t('empty.title')}</h2>
        <p className="max-w-md text-sm text-muted">{t('empty.description')}</p>
        <Link href="/resources">{t('empty.browseResources')}</Link>
      </div>
    );
  }

  return <DashboardGrid pins={pins} />;
}

export function DashboardPage() {
  const { t } = useTranslations({ en, de });

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<LayoutDashboardIcon />} />
      <DashboardContent />
    </div>
  );
}

/**
 * The start page. A user with pins sees the dashboard; a user without any keeps landing on the resource overview,
 * with query and hash intact. A failed load shows the dashboard's retry instead of guessing "no pins".
 */
export function DashboardLanding() {
  const { data: pins, isPending, isError } = useDashboardPins();

  if (isPending) return <LoadingDashboard />;
  if (!isError && pins.length === 0) return <RootRedirect />;
  return <DashboardPage />;
}
