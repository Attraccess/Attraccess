import { useState } from 'react';
import {
  Chip,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  Tooltip,
  TooltipContent,
} from '@heroui/react';
import { AlertTriangle, BookOpen, CheckCircle2, Trash2, Upload } from 'lucide-react';
import { usePluginsServiceDeletePlugin, usePluginsServiceGetPlugins } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { SettingsSection } from '../../components/SettingsSection';
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { EmptyState } from '../../../../components/emptyState';
import { useToastMessage } from '../../../../components/toastProvider';
import { UploadPluginModal } from '../../../plugins/UploadPluginModal';
import en from './en.json';
import de from './de.json';

const DOCS_URL = 'https://docs.attraccess.org/#/plugins/developing-plugins';

/**
 * Installed plugins. This is the one section on `system.plugins.manage` rather than
 * `system.settings.manage` — see the registry for why the narrower permission survived the move.
 *
 * Uploading and removing are actions against the plugin store, not edits to a form, so there is no
 * save bar; the table keeps its own confirmation modal.
 */
export function PluginsSection() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();

  const { data: plugins } = usePluginsServiceGetPlugins();
  const [pluginToDelete, setPluginToDelete] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const { mutate: deletePlugin, isPending: isDeleting } = usePluginsServiceDeletePlugin({
    onSuccess: () => {
      // The server drops the plugin's bundle from the served asset set, so the running frontend is
      // holding modules that no longer exist — a reload is the only way back to a consistent app.
      setTimeout(() => window.location.reload(), 5000);
      setPluginToDelete(null);
      toast.success({ title: t('success.delete.title'), description: t('success.delete.description') });
    },
    onError: () => {
      toast.error({ title: t('error.delete.title'), description: t('error.delete.description') });
    },
  });

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
        <div className="flex">
          <Button
            variant="primary"
            size="sm"
            onPress={() => setIsUploadOpen(true)}
            data-cy="plugins-list-upload-plugin-button"
          >
            <Upload size={16} />
            {t('uploadButton')}
          </Button>
        </div>

        <Table data-cy="plugins-list-table">
          <TableScrollContainer>
            <TableContent aria-label={t('title')}>
              <TableHeader>
                <TableColumn isRowHeader>{t('columns.name')}</TableColumn>
                <TableColumn>{t('columns.version')}</TableColumn>
                <TableColumn className="hidden sm:table-cell">{t('columns.directory')}</TableColumn>
                <TableColumn className="hidden sm:table-cell">{t('columns.permissions')}</TableColumn>
                <TableColumn>{t('columns.status')}</TableColumn>
                <TableColumn width="0" className="text-right">
                  {t('columns.actions')}
                </TableColumn>
              </TableHeader>
              <TableBody items={plugins ?? []} renderEmptyState={() => <EmptyState />}>
                {(plugin) => (
                  <TableRow key={plugin.name} id={plugin.name}>
                    <TableCell>{plugin.name}</TableCell>
                    <TableCell>
                      <Chip variant="soft" color="accent">
                        {plugin.version}
                      </Chip>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{plugin.pluginDirectory || '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {plugin.permissions && plugin.permissions.length > 0 ? (
                        <div className="flex flex-wrap gap-1" data-cy={`plugins-list-permissions-${plugin.id}`}>
                          {plugin.permissions.map((permission) => (
                            <Chip key={permission} variant="soft" color="warning">
                              {permission}
                            </Chip>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">{t('noPermissions')}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {plugin.status === 'error' ? (
                        <Tooltip>
                          <Chip variant="soft" color="danger" data-cy={`plugins-list-status-${plugin.id}`}>
                            <span className="inline-flex items-center gap-1">
                              <AlertTriangle size={14} />
                              {t('status.error')}
                            </span>
                          </Chip>
                          <TooltipContent>{t('status.errorTooltip', { message: plugin.error ?? '' })}</TooltipContent>
                        </Tooltip>
                      ) : plugin.status === 'loaded' ? (
                        <Chip variant="soft" color="success" data-cy={`plugins-list-status-${plugin.id}`}>
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 size={14} />
                            {t('status.loaded')}
                          </span>
                        </Chip>
                      ) : (
                        <Chip variant="soft" color="default" data-cy={`plugins-list-status-${plugin.id}`}>
                          {t('status.unknown')}
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Tooltip>
                          <Button
                            variant="danger-soft"
                            size="sm"
                            isIconOnly
                            aria-label={t('deleteTooltip')}
                            onPress={() => setPluginToDelete(plugin.id)}
                            data-cy={`plugins-list-delete-plugin-button-${plugin.id}`}
                          >
                            <Trash2 size={16} />
                          </Button>
                          <TooltipContent>{t('deleteTooltip')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>
      </div>

      <StandardModal
        isOpen={pluginToDelete !== null}
        onOpenChange={(open) => !open && setPluginToDelete(null)}
        data-cy="plugins-list-delete-confirmation-modal"
        size="sm"
      >
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('deleteConfirmation.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              {t('deleteConfirmation.message', {
                pluginName: plugins?.find((plugin) => plugin.id === pluginToDelete)?.name ?? '',
              })}
            </ModalBody>
            <ModalFooter>
              <Button
                variant="ghost"
                onPress={close}
                isDisabled={isDeleting}
                data-cy="plugins-list-delete-confirmation-cancel-button"
              >
                {t('deleteConfirmation.cancel')}
              </Button>
              <Button
                variant="danger"
                onPress={() => pluginToDelete && deletePlugin({ pluginId: pluginToDelete })}
                isPending={isDeleting}
                data-cy="plugins-list-delete-confirmation-delete-button"
              >
                {t('deleteConfirmation.delete')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>

      <UploadPluginModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
    </SettingsSection>
  );
}

export default PluginsSection;
