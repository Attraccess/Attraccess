import { usePluginsServiceDeletePlugin, usePluginsServiceGetPlugins } from '@attraccess/react-query-client';
import { useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Chip,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
  Alert,
} from '@heroui/react';
import { Trash2, Upload } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { UploadPluginModal } from './UploadPluginModal';
import { useToastMessage } from '../../components/toastProvider';
import { EmptyState } from '../../components/emptyState';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../hooks/useReactQueryStatusToHeroUiTableLoadingState';
import { TableDataLoadingIndicator } from '../../components/tableComponents';

import de from './PluginsList.de.json';
import en from './PluginsList.en.json';

export function PluginsList() {
  const { data: plugins, status: fetchStatus } = usePluginsServiceGetPlugins();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pluginToDelete, setPluginToDelete] = useState<string | null>(null);
  const toast = useToastMessage();

  const loadingState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

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

  const { t } = useTranslations('plugins-list', {
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

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setPluginToDelete(null);
  };

  return (
    <>
      <Alert color="danger" className="mb-4" data-cy="plugins-list-work-in-progress-alert">
        {t('workInProgressAlert')}
      </Alert>
      <Card className="w-full" data-cy="plugins-list-card">
        <CardHeader className="flex justify-between items-center">
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <Button
            color="primary"
            startContent={<Upload size={18} />}
            onPress={() => setUploadModalOpen(true)}
            data-cy="plugins-list-upload-plugin-button"
          >
            {t('uploadButton')}
          </Button>
        </CardHeader>
        <CardBody>
          <Table aria-label="Plugins table" data-cy="plugins-list-table">
            <TableHeader>
              <TableColumn>{t('columns.name')}</TableColumn>
              <TableColumn>{t('columns.version')}</TableColumn>
              <TableColumn>{t('columns.directory')}</TableColumn>
              <TableColumn>{t('columns.actions')}</TableColumn>
            </TableHeader>
            <TableBody
              items={plugins}
              loadingState={loadingState}
              loadingContent={<TableDataLoadingIndicator />}
              emptyContent={<EmptyState />}
            >
              {(plugin) => (
                <TableRow key={plugin.name}>
                  <TableCell>{plugin.name}</TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat" color="primary">
                      {plugin.version}
                    </Chip>
                  </TableCell>
                  <TableCell>{plugin.pluginDirectory || '-'}</TableCell>
                  <TableCell>
                    <Tooltip content={t('deleteTooltip')}>
                      <Button
                        isIconOnly
                        variant="light"
                        color="danger"
                        onPress={() => handleDeleteClick(plugin.id)}
                        data-cy={`plugins-list-delete-plugin-button-${plugin.id}`}
                      >
                        <Trash2 size={18} />
                      </Button>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>

        <Modal
          isOpen={deleteModalOpen}
          onOpenChange={setDeleteModalOpen}
          data-cy="plugins-list-delete-confirmation-modal"
        >
          <ModalContent>
            <ModalHeader>{t('deleteConfirmation.title')}</ModalHeader>
            <ModalBody>
              {t('deleteConfirmation.message', {
                pluginName: plugins?.find((plugin) => plugin.id === pluginToDelete)?.name,
              })}
            </ModalBody>
            <ModalFooter>
              <Button
                variant="flat"
                onPress={handleDeleteCancel}
                isDisabled={isDeleting}
                data-cy="plugins-list-delete-confirmation-cancel-button"
              >
                {t('deleteConfirmation.cancel')}
              </Button>
              <Button
                color="danger"
                onPress={handleDeleteConfirm}
                isLoading={isDeleting}
                data-cy="plugins-list-delete-confirmation-delete-button"
              >
                {t('deleteConfirmation.delete')}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <UploadPluginModal isOpen={uploadModalOpen} onClose={() => setUploadModalOpen(false)} />
      </Card>
    </>
  );
}
