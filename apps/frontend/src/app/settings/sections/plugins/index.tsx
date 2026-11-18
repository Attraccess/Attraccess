import { Button } from '@attraccess/plugins-frontend-ui';
import { usePluginsServiceGetPluginSystemStatus } from '@attraccess/react-query-client';
import type { MarketplacePluginDto } from '@attraccess/react-query-client';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { BookOpen } from 'lucide-react';
import { useState } from 'react';
import { ReaderUiAlerts } from '../../../readerUi/ReaderUiAlerts';
import { UploadPluginModal } from '../../../plugins/UploadPluginModal';
import { SettingsSection } from '../../components/SettingsSection';
import { PluginErrorModal } from './installed/PluginErrorModal';
import { PluginsTable } from './installed/PluginsTable';
import { PluginToolbar } from './installed/PluginToolbar';
import { RemovePluginModal } from './installed/RemovePluginModal';
import { useInstalledNpmPlugins } from './installed/useInstalledNpmPlugins';
import { InstallPluginModal } from './marketplace/InstallPluginModal';
import { MarketplaceBrowser } from './marketplace/MarketplaceBrowser';
import { useMarketplaceBrowserState } from './marketplace/useMarketplaceBrowserState';
import type { FailedPlugin, VersionPlugin } from './types';
import { usePluginsTranslations } from './usePluginsTranslations';
import { VersionManagementModal } from './versions/VersionManagementModal';

const DOCS_URL = 'https://docs.attraccess.org/#/plugins/developing-plugins';

/**
 * Installed plugins. This is the one section on `system.plugins.manage` rather than
 * `system.settings.manage` — see the registry for why the narrower permission survived the move.
 *
 * Uploading and removing are actions against the plugin store, not edits to a form, so there is no
 * save bar; the table keeps its own confirmation modal.
 */
export function PluginsSection() {
  const { t } = usePluginsTranslations();
  const { data: pluginSystemStatus } = usePluginsServiceGetPluginSystemStatus();
  const { installed } = useInstalledNpmPlugins();
  const marketplace = useMarketplaceBrowserState();
  const [failedPlugin, setFailedPlugin] = useState<FailedPlugin | null>(null);
  const [pluginToDelete, setPluginToDelete] = useState<string | null>(null);
  const [pluginToInstall, setPluginToInstall] = useState<MarketplacePluginDto | null>(null);
  const [versionPlugin, setVersionPlugin] = useState<VersionPlugin | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const availableUpdates = installed.filter((plugin) => plugin.updateCheck?.state === 'available');

  const aside = (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{t('aside.title')}</h3>
      <p className="text-xs text-muted">{t('aside.description')}</p>
      <a href={DOCS_URL} target="_blank" rel="noreferrer" data-cy="plugins-list-docs-link">
        <Button variant="secondary" size="sm">
          <BookOpen size={16} />
          {t('docsButton')}
        </Button>
      </a>
    </div>
  );

  return (
    <SettingsSection title={t('title')} description={t('description')} aside={aside}>
      <div data-cy="plugins-list-card" className="flex flex-col gap-4">
        {pluginSystemStatus?.disabled === true ? (
          <Alert status="warning" data-cy="plugins-disabled-warning">
            <AlertContent>
              <AlertTitle>{t('disabledWarning.title')}</AlertTitle>
              <AlertDescription>{t('disabledWarning.description')}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}
        {availableUpdates.length > 0 ? (
          <Alert status="warning" data-cy="plugins-list-updates-available">
            <AlertContent>
              <AlertTitle>{t('updatePolicy.availableTitle')}</AlertTitle>
              <AlertDescription>
                {t('updatePolicy.availableDescription', { count: String(availableUpdates.length) })}
              </AlertDescription>
              <Button
                className="mt-2"
                variant="secondary"
                size="sm"
                onPress={() => setVersionPlugin(availableUpdates[0])}
              >
                {t('updatePolicy.reviewUpdates')}
              </Button>
            </AlertContent>
          </Alert>
        ) : null}
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
