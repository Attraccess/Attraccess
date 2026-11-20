import { EmptyState, TableActionsColumnHeader } from '@attraccess/plugins-frontend-ui';
import { useGetPlugins } from '@attraccess/react-query-client';
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
  const { data: plugins } = useGetPlugins();
  const { installedByDirectory } = useInstalledNpmPlugins();

  return (
    <Table data-cy="plugins-list-table">
      <TableScrollContainer>
        {/* Arrow mode (child focus): arrow keys land on the row's actions trigger, and focus returns to that trigger
            when its menu or a dialog opened from it closes, instead of to the last focused cell. */}
        <TableContent aria-label={t('title')} keyboardNavigationBehavior="arrow">
          <TableHeader>
            <TableColumn isRowHeader>{t('columns.name')}</TableColumn>
            <TableColumn>{t('columns.version')}</TableColumn>
            <TableColumn className="hidden sm:table-cell">{t('columns.directory')}</TableColumn>
            <TableColumn className="hidden sm:table-cell">{t('columns.permissions')}</TableColumn>
            <TableColumn className="hidden md:table-cell">{t('columns.source')}</TableColumn>
            <TableColumn>{t('columns.status')}</TableColumn>
            <TableColumn id="actions">
              <TableActionsColumnHeader />
            </TableColumn>
          </TableHeader>
          <TableBody
            items={plugins ?? []}
            dependencies={[installedByDirectory, onShowError, onShowDetails, onManageVersion, onDelete]}
            renderEmptyState={() => <EmptyState />}
          >
            {(plugin) => (
              <PluginRow
                plugin={plugin}
                installed={installedByDirectory.get(plugin.pluginDirectory)}
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
