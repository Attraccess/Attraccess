import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Link } from '@heroui/react';
import { PlusIcon } from 'lucide-react';
import type { DashboardWidgetRenderProps } from '@attraccess/plugins-frontend-sdk';
import { useDebounce, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useResourcesServiceGetAllResources } from '@attraccess/react-query-client';
import { useAuth } from '../../../hooks/useAuth';
import { CreateResourceDrawer } from '../../resourceOverview/createResourceDrawer';
import { StatusChip } from '../../resourceOverview/resourceGroupCard/statusChip';
import { itemsPerSize, WidgetEmpty, WidgetError, WidgetList, WidgetLoading, WidgetSearch } from './widgetParts';
import de from './de.json';
import en from './en.json';

const RESULTS_PER_SIZE = { medium: 3, large: 7 };

function Results({ term, limit }: Readonly<{ term: string; limit: number }>) {
  const { t } = useTranslations({ en, de });
  const { data, isPending, isError } = useResourcesServiceGetAllResources({ search: term, limit });

  if (isPending) return <WidgetLoading />;
  if (isError || !data) return <WidgetError title={t('loadError')} />;
  if (data.data.length === 0) return <WidgetEmpty>{t('resources.noMatch')}</WidgetEmpty>;
  return (
    <WidgetList>
      {data.data.map((resource) => (
        <li key={resource.id} className="flex min-w-0 items-center justify-between gap-2">
          <Link
            href={`/resources/${resource.id}`}
            className="block min-w-0 max-w-full truncate text-sm leading-tight"
            data-cy="dashboard-resources-result"
          >
            {resource.name}
          </Link>
          <span className="shrink-0">
            <StatusChip resourceId={resource.id} />
          </span>
        </li>
      ))}
    </WidgetList>
  );
}

/**
 * A resource search with live results, each opening its resource. Enter opens the overview with the term. Creating a
 * resource is offered to those who may.
 */
export function ResourcesWidget({ size, isPreview }: Readonly<DashboardWidgetRenderProps>) {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [term, setTerm] = useState('');
  const search = useDebounce(term.trim(), 300);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <WidgetSearch
          label={t('resources.searchLabel')}
          value={term}
          onChange={setTerm}
          onSubmit={(value) => navigate(value ? `/resources?q=${encodeURIComponent(value)}` : '/resources')}
          data-cy="dashboard-resources-search"
        />
        {hasPermission('resources.create') && (
          <Button
            isIconOnly
            className="shrink-0"
            variant="secondary"
            aria-label={t('resources.create')}
            onPress={() => setIsCreateOpen(true)}
            data-cy="dashboard-resources-create"
          >
            <PlusIcon className="w-4 h-4" />
          </Button>
        )}
      </div>
      {search && <Results term={search} limit={itemsPerSize(size, RESULTS_PER_SIZE)} />}
      {!isPreview && <CreateResourceDrawer isOpen={isCreateOpen} onOpenChange={setIsCreateOpen} />}
    </div>
  );
}
