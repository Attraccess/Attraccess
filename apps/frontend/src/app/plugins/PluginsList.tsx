import { usePluginsServiceDeletePlugin, usePluginsServiceGetPlugins } from '@attraccess/react-query-client';
import { useState } from 'react';
import {
  Chip,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
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
  Tooltip,
  TooltipContent,
} from '@heroui/react';
import { Button } from '../../components/button';
import { BookOpen, Trash2, Upload } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { UploadPluginModal } from './UploadPluginModal';
import { useToastMessage } from '../../components/toastProvider';
import { EmptyState } from '../../components/emptyState';
import { PageHeader } from '../../components/pageHeader';

import de from './PluginsList.de.json';
import en from './PluginsList.en.json';

export function PluginsList() {
  const { data: plugins } = usePluginsServiceGetPlugins();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pluginToDelete, setPluginToDelete] = useState<string | null>(null);
  const toast = useToastMessage();

  const { mutate: deletePlugin, isPending: isDeleting } = usePluginsServiceDeletePlugin({
    onSuccess: () => {
      setTimeout(() => {
        window.location.reload();
      }, 5000);
      setDeleteModalOpen(false);
      setPluginToDelete(null);
      toast.success({
        title: t('success.delete.title'),
        description: t('success.delete.description'),
      });
    },
    onError: (error) => {
      console.error('Failed to delete plugin:', error);
      toast.error({
        title: t('error.delete.title'),
        description: t('error.delete.description'),
      });
    },
  });

  const { t } = useTranslations({
    en,
    de,
  });

  const handleDeleteClick = (pluginId: string) => {
    setPluginToDelete(pluginId);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!pluginToDelete) return;

    try {
      deletePlugin({ pluginId: pluginToDelete });
    } catch (error) {
      console.error('Failed to delete plugin:', error);
    }
  };

  return (
    <div data-cy="plugins-list-card">
      <PageHeader
        title={t('title')}
        actions={[
          {
            key: 'docs',
            label: t('docsButton'),
            icon: <BookOpen size={18} />,
            variant: 'secondary',
            renderTrigger: (triggerProps) => (
              <a
                href="https://docs.attraccess.org/#/plugins/developing-plugins"
                target="_blank"
                rel="noreferrer"
                data-cy="plugins-list-docs-link"
              >
                <Button {...triggerProps} />
              </a>
            ),
          },
          {
            key: 'upload',
            label: t('uploadButton'),
            icon: <Upload size={18} />,
            variant: 'primary',
            onPress: () => setUploadModalOpen(true),
            dataCy: 'plugins-list-upload-plugin-button',
          },
        ]}
      />
      <Table data-cy="plugins-list-table">
        <TableContent aria-label="Plugins table">
          <TableHeader>
            <TableColumn isRowHeader>{t('columns.name')}</TableColumn>
            <TableColumn>{t('columns.version')}</TableColumn>
            <TableColumn>{t('columns.directory')}</TableColumn>
            <TableColumn>{t('columns.permissions')}</TableColumn>
            <TableColumn>{t('columns.actions')}</TableColumn>
          </TableHeader>
          <TableBody items={plugins} renderEmptyState={() => <EmptyState />}>
            {(plugin) => (
              <TableRow key={plugin.name} id={plugin.name}>
                <TableCell>{plugin.name}</TableCell>
                <TableCell>
                  <Chip variant="soft" color="accent">
                    {plugin.version}
                  </Chip>
                </TableCell>
                <TableCell>{plugin.pluginDirectory || '-'}</TableCell>
                <TableCell>
                  {plugin.permissions && plugin.permissions.length > 0 ? (
                    <div className="flex flex-wrap gap-1" data-cy={`plugins-list-permissions-${plugin.id}`}>
                      {plugin.permissions.map((permission) => (
                        <Chip key={permission} variant="soft" color="warning">
                          {permission}
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <span className="text-default-400">{t('noPermissions')}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Tooltip>
                    <Button
                      variant="danger-soft"
                      isIconOnly
                      onPress={() => handleDeleteClick(plugin.id)}
                      data-cy={`plugins-list-delete-plugin-button-${plugin.id}`}
                    >
                      <Trash2 size={18} />
                    </Button>
                    <TooltipContent>{t('deleteTooltip')}</TooltipContent>
                  </Tooltip>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </Table>

      <Modal
        isOpen={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        data-cy="plugins-list-delete-confirmation-modal"
      >
        <ModalBackdrop>
          <ModalContainer size="sm">
            <ModalDialog>
              {({ close }) => (
                <>
                  <ModalHeader>
                    <ModalHeading>{t('deleteConfirmation.title')}</ModalHeading>
                  </ModalHeader>
                  <ModalBody>
                    {t('deleteConfirmation.message', {
                      pluginName: plugins?.find((plugin) => plugin.id === pluginToDelete)?.name,
                    })}
                  </ModalBody>
                  <ModalFooter>
                    <Button
                      variant="secondary"
                      onPress={close}
                      isDisabled={isDeleting}
                      data-cy="plugins-list-delete-confirmation-cancel-button"
                    >
                      {t('deleteConfirmation.cancel')}
                    </Button>
                    <Button
                      variant="danger"
                      onPress={handleDeleteConfirm}
                      isPending={isDeleting}
                      data-cy="plugins-list-delete-confirmation-delete-button"
                    >
                      {t('deleteConfirmation.delete')}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>

      <UploadPluginModal isOpen={uploadModalOpen} onClose={() => setUploadModalOpen(false)} />
    </div>
  );
}
