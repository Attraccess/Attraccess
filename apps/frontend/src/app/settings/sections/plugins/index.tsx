import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Table,
  TableBody,
  TableColumn,
  TableContent,
  TableHeader,
  TableScrollContainer,
} from '@heroui/react';
import { SettingsSection } from '../../components/SettingsSection';
import { Button } from '../../../../components/button';
import { EmptyState } from '../../../../components/emptyState';
import { UploadPluginModal } from '../../../plugins/UploadPluginModal';
import { usePluginsSectionState } from './usePluginsSectionState';
import { PluginsSectionStandardModal } from './PluginsSectionStandardModal';
import { PluginsSectionPluginsListCheckUpdatesButton } from './PluginsSectionPluginsListCheckUpdatesButton';
import { PluginsSectionStandardModalMarketplaceBack } from './PluginsSectionStandardModalMarketplaceBack';
import { PluginsSectionStandardModalDeleteConfirmationTitle } from './PluginsSectionStandardModalDeleteConfirmationTitle';
import { PluginsSectionStandardModalMarketplaceInstallTitle } from './PluginsSectionStandardModalMarketplaceInstallTitle';
import { PluginsSectionStandardModalStatusErrorTitle } from './PluginsSectionStandardModalStatusErrorTitle';
import { renderPluginsSectionPluginsRows } from './renderPluginsSectionPluginsRows';

/**
 * Installed plugins. This is the one section on `system.plugins.manage` rather than
 * `system.settings.manage` — see the registry for why the narrower permission survived the move.
 *
 * Uploading and removing are actions against the plugin store, not edits to a form, so there is no
 * save bar; the table keeps its own confirmation modal.
 */
export function PluginsSection() {
  const model = usePluginsSectionState();

  return (
    <SettingsSection title={model.t('title')} description={model.t('description')} aside={model.aside}>
      <div data-cy="plugins-list-card" className="flex flex-col gap-4">
        {model.pluginsDisabled ? (
          <Alert status="warning" data-cy="plugins-disabled-warning">
            <AlertContent>
              <AlertTitle>{model.t('disabledWarning.title')}</AlertTitle>
              <AlertDescription>{model.t('disabledWarning.description')}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}
        {model.availableUpdates.length > 0 ? (
          <Alert status="warning" data-cy="plugins-list-updates-available">
            <AlertContent>
              <AlertTitle>{model.t('updatePolicy.availableTitle')}</AlertTitle>
              <AlertDescription>
                {model.t('updatePolicy.availableDescription', { count: String(model.availableUpdates.length) })}
              </AlertDescription>
              <Button
                className="mt-2"
                variant="secondary"
                size="sm"
                onPress={() => void model.openVersionManagement(model.availableUpdates[0])}
              >
                {model.t('updatePolicy.reviewUpdates')}
              </Button>
            </AlertContent>
          </Alert>
        ) : null}
        <PluginsSectionPluginsListCheckUpdatesButton {...model} />

        <Table data-cy="plugins-list-table">
          <TableScrollContainer>
            <TableContent aria-label={model.t('title')}>
              <TableHeader>
                <TableColumn isRowHeader>{model.t('columns.name')}</TableColumn>
                <TableColumn>{model.t('columns.version')}</TableColumn>
                <TableColumn className="hidden sm:table-cell">{model.t('columns.directory')}</TableColumn>
                <TableColumn className="hidden sm:table-cell">{model.t('columns.permissions')}</TableColumn>
                <TableColumn className="hidden md:table-cell">{model.t('columns.source')}</TableColumn>
                <TableColumn>{model.t('columns.status')}</TableColumn>
                <TableColumn width="0" className="text-right">
                  {model.t('columns.actions')}
                </TableColumn>
              </TableHeader>
              <TableBody
                items={model.plugins ?? []}
                dependencies={[model.installedNpmPlugins, model.npmPluginNames, model.t]}
                renderEmptyState={() => <EmptyState />}
              >
                {(plugin) =>
                  renderPluginsSectionPluginsRows(plugin, {
                    installedNpmPlugins: model.installedNpmPlugins,
                    t: model.t,
                    setFailedPlugin: model.setFailedPlugin,
                    npmPluginNames: model.npmPluginNames,
                    openMarketplacePlugin: model.openMarketplacePlugin,
                    openVersionManagement: model.openVersionManagement,
                    setApprovedRemovalPlan: model.setApprovedRemovalPlan,
                    setRemoveFailure: model.setRemoveFailure,
                    setPluginToDelete: model.setPluginToDelete,
                  })
                }
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>

        <PluginsSectionStandardModalStatusErrorTitle {...model} />

        <PluginsSectionStandardModalMarketplaceBack {...model} />
      </div>

      <PluginsSectionStandardModalMarketplaceInstallTitle {...model} />

      <PluginsSectionStandardModalDeleteConfirmationTitle {...model} />

      <PluginsSectionStandardModal {...model} />

      <UploadPluginModal isOpen={model.isUploadOpen} onClose={() => model.setIsUploadOpen(false)} />
    </SettingsSection>
  );
}

export default PluginsSection;
