import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@heroui/react';
import { PlusIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../hooks/useAuth';
import { CreateResourceDrawer } from '../../resourceOverview/createResourceDrawer';
import { useCanOpenPage } from './access';
import { WidgetActions, WidgetLinkButton, WidgetSearch } from './widgetParts';
import de from './de.json';
import en from './en.json';

/** Pages the widget links to, each shown only to users who may open it. */
const LINKS = [
  { path: '/resources', key: 'all' },
  { path: '/devices/flows', key: 'flows' },
  { path: '/devices/mqtt/servers', key: 'mqtt' },
  { path: '/attractap/readers', key: 'readers' },
  { path: '/csv-export', key: 'reports' },
] as const;

/** A resource search that opens the overview with the term, and quick links into resource management. */
export function ResourcesWidget() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canOpen = useCanOpenPage();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <WidgetSearch
        label={t('resources.searchLabel')}
        submitLabel={t('search')}
        onSearch={(term) => navigate(term ? `/resources?q=${encodeURIComponent(term)}` : '/resources')}
        data-cy="dashboard-resources-search"
      />
      <WidgetActions>
        {LINKS.filter(({ path }) => canOpen(path)).map(({ path, key }) => (
          <WidgetLinkButton key={path} href={path} data-cy={`dashboard-resources-${key}`}>
            {t(`resources.${key}`)}
          </WidgetLinkButton>
        ))}
        {hasPermission('resources.create') && (
          <Button
            size="sm"
            variant="secondary"
            onPress={() => setIsCreateOpen(true)}
            data-cy="dashboard-resources-create"
          >
            <PlusIcon className="w-4 h-4" />
            {t('resources.create')}
          </Button>
        )}
      </WidgetActions>
      <CreateResourceDrawer isOpen={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}
