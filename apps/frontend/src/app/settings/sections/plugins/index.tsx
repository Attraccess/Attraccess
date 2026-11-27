import { useGetPluginSystemStatus } from '@attraccess/react-query-client';
import type { MarketplacePluginDto } from '@attraccess/react-query-client';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { useState } from 'react';
import { ReaderUiAlerts } from '../../../readerUi/ReaderUiAlerts';
import { UploadPluginModal } from '../../../plugins/UploadPluginModal';
import { SettingsSection } from '../../components/SettingsSection';
import { AutomaticUpdatesPanel } from './autoUpdates/AutomaticUpdatesPanel';
import { UpdatesAvailableAlert } from './installed/UpdatesAvailableAlert';
import { PluginErrorModal } from './installed/PluginErrorModal';
import { PluginsTable } from './installed/PluginsTable';
import { PluginToolbar } from './installed/PluginToolbar';
import { RemovePluginModal } from './installed/RemovePluginModal';
import { useInstalledNpmPlugins } from './installed/useInstalledNpmPlugins';
import { useRemovalNotice } from './installed/useRemovalNotice';
import { InstallPluginModal } from './marketplace/InstallPluginModal';
import { MarketplaceBrowser } from './marketplace/MarketplaceBrowser';
import { useMarketplaceBrowserState } from './marketplace/useMarketplaceBrowserState';
import type { FailedPlugin, VersionPlugin } from './types';
import { usePluginsTranslations } from './usePluginsTranslations';
import { VersionManagementModal } from './versions/VersionManagementModal';

/**
 * Installed plugins. This is the one section on `system.plugins.manage` rather than
 * `system.settings.manage` — see the registry for why the narrower permission survived the move.
 *
 * Uploading and removing are actions against the plugin store, not edits to a form, so there is no
 * save bar; the table keeps its own confirmation modal.
 */
export function PluginsSection() {
  const { t } = usePluginsTranslations();
  const { data: pluginSystemStatus } = useGetPluginSystemStatus();
  const { installed } = useInstalledNpmPlugins();
  const marketplace = useMarketplaceBrowserState();
  useRemovalNotice();
  const [failedPlugin, setFailedPlugin] = useState<FailedPlugin | null>(null);
  const [pluginToDelete, setPluginToDelete] = useState<string | null>(null);
  const [pluginToInstall, setPluginToInstall] = useState<MarketplacePluginDto | null>(null);
  const [versionPlugin, setVersionPlugin] = useState<VersionPlugin | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  return (
    <SettingsSection title={t('title')} description={t('description')} fullWidth>
      <div data-cy="plugins-list-card" className="flex flex-col gap-4">
        {pluginSystemStatus?.disabled === true ? (
          <Alert status="warning" data-cy="plugins-disabled-warning">
            <AlertContent>
              <AlertTitle>{t('disabledWarning.title')}</AlertTitle>
              <AlertDescription>{t('disabledWarning.description')}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}
        <AutomaticUpdatesPanel />
        <UpdatesAvailableAlert onReview={setVersionPlugin} />
        <PluginToolbar
          onOpenMarketplace={() => marketplace.setIsOpen(true)}
          onOpenUpload={() => setIsUploadOpen(true)}
        />

        <PluginsTable
          onShowError={setFailedPlugin}
          onShowDetails={marketplace.openDetails}
          onManageVersion={setVersionPlugin}
          onDelete={setPluginToDelete}
        />

        <ReaderUiAlerts />

        <PluginErrorModal
          failedPlugin={failedPlugin}
          onClose={() => setFailedPlugin(null)}
          onRemove={(pluginId) => {
            setFailedPlugin(null);
            setPluginToDelete(pluginId);
          }}
        />

        <MarketplaceBrowser
          isOpen={marketplace.isOpen}
          onOpenChange={(open) => (open ? marketplace.setIsOpen(true) : marketplace.dismiss())}
          plugin={marketplace.plugin}
          isLoadingDetail={marketplace.isLoadingDetail}
          onOpenDetails={marketplace.openDetails}
          onBack={marketplace.closeDetails}
          onInstall={setPluginToInstall}
          onManageVersion={(plugin) => {
            marketplace.setIsOpen(false);
            setVersionPlugin({
              name: plugin.name,
              version: installed.find((entry) => entry.name === plugin.name)?.version ?? plugin.version ?? '',
            });
          }}
        />
      </div>

      <InstallPluginModal plugin={pluginToInstall} onClose={() => setPluginToInstall(null)} />

      <RemovePluginModal pluginId={pluginToDelete} onClose={() => setPluginToDelete(null)} />

      <VersionManagementModal plugin={versionPlugin} onClose={() => setVersionPlugin(null)} />

      <UploadPluginModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
    </SettingsSection>
  );
}

export default PluginsSection;
