import { EmptyState } from '@attraccess/plugins-frontend-ui';
import { usePluginsServiceGetPlugins } from '@attraccess/react-query-client';
import { Table, TableBody, TableColumn, TableContent, TableHeader, TableScrollContainer } from '@heroui/react';
import type { FailedPlugin, MarketplaceDetailRequest, VersionPlugin } from '../types';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { PluginRow } from './PluginRow';
import { useInstalledNpmPlugins } from './useInstalledNpmPlugins';

interface Props {
  onShowError: (plugin: FailedPlugin) => void;
  onShowDetails: (request: MarketplaceDetailRequest) => void;
  onManageVersion: (plugin: VersionPlugin) => void;
  onDelete: (pluginId: string) => void;
}

export function PluginsTable({ onShowError, onShowDetails, onManageVersion, onDelete }: Props) {
  const { t } = usePluginsTranslations();
  const { data: plugins } = usePluginsServiceGetPlugins();
  const { installedByName } = useInstalledNpmPlugins();

  return (
    <Table data-cy="plugins-list-table">
      <TableScrollContainer>
        <TableContent aria-label={t('title')}>
          <TableHeader>
            <TableColumn isRowHeader>{t('columns.name')}</TableColumn>
            <TableColumn>{t('columns.version')}</TableColumn>
            <TableColumn className="hidden sm:table-cell">{t('columns.directory')}</TableColumn>
            <TableColumn className="hidden sm:table-cell">{t('columns.permissions')}</TableColumn>
            <TableColumn className="hidden md:table-cell">{t('columns.source')}</TableColumn>
            <TableColumn>{t('columns.status')}</TableColumn>
            <TableColumn width="0" className="text-right">
              {t('columns.actions')}
            </TableColumn>
          </TableHeader>
          <TableBody
            items={plugins ?? []}
            dependencies={[installedByName, onShowError, onShowDetails, onManageVersion, onDelete]}
            renderEmptyState={() => <EmptyState />}
          >
            {(plugin) => (
              <PluginRow
                plugin={plugin}
                installed={installedByName.get(plugin.name)}
                onShowError={onShowError}
                onShowDetails={onShowDetails}
                onManageVersion={onManageVersion}
                onDelete={onDelete}
              />
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}
