import {
  Card,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  Input,
  Label,
  Spinner,
  Table,
  TableBody,
  TableColumn,
  TableContent,
  TableHeader,
  TableScrollContainer,
  TextField,
} from '@heroui/react';
import { MonitorSmartphoneIcon } from 'lucide-react';
import { PageHeader } from '../../../components/pageHeader';
import { Button } from '../../../components/button';
import { StandardDrawer } from '../../../components/standardDrawer';
import { EmptyState } from '../../../components/emptyState';
import { DeleteConfirmationModal } from '../../../components/deleteConfirmationModal';
import { DeviceRow } from './index.helpers';
import { useCompanionSettingsPageState } from './useCompanionSettingsPageState';
import { CompanionSettingsPageDownloadTitle } from './CompanionSettingsPageDownloadTitle';

export function CompanionSettingsPage() {
  const {
    t,
    formatDateTime,
    devices,
    devicesLoading,
    manifest,
    manifestLoading,
    renamingDevice,
    setRenamingDevice,
    renameValue,
    setRenameValue,
    deletingDevice,
    setDeletingDevice,
    isRenamePending,
    isDeleting,
    handleRenameStart,
    handleRenameSave,
    handleDeleteConfirm,
    downloadUrl,
  } = useCompanionSettingsPageState();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<MonitorSmartphoneIcon size={20} />} />

      {/* Registered Devices */}
      <Card>
        <Card.Header className="flex flex-col items-start gap-1">
          <span className="text-base font-semibold">{t('devices.title')}</span>
          <span className="text-sm text-default-500">{t('devices.subtitle')}</span>
        </Card.Header>
        <Card.Content>
          {devicesLoading ? (
            <div className="flex justify-center py-6">
              <Spinner size="sm" />
            </div>
          ) : (
            <Table>
              <TableScrollContainer>
                <TableContent aria-label={t('devices.title')}>
                  <TableHeader>
                    <TableColumn isRowHeader>{t('devices.columns.name')}</TableColumn>
                    <TableColumn>{t('devices.columns.status')}</TableColumn>
                    <TableColumn>{t('devices.columns.lastSeen')}</TableColumn>
                    <TableColumn>{t('devices.columns.version')}</TableColumn>
                    <TableColumn>{t('devices.columns.actions')}</TableColumn>
                  </TableHeader>
                  <TableBody items={devices ?? []} renderEmptyState={() => <EmptyState />}>
                    {(device) => (
                      <DeviceRow
                        key={device.id}
                        device={device}
                        latestVersion={manifest?.version ?? null}
                        onRenameStart={handleRenameStart}
                        onDeleteStart={setDeletingDevice}
                        t={t}
                        formatDateTime={formatDateTime}
                      />
                    )}
                  </TableBody>
                </TableContent>
              </TableScrollContainer>
            </Table>
          )}
        </Card.Content>
      </Card>

      {/* Download + Setup side by side */}
      <CompanionSettingsPageDownloadTitle {...{ t, manifest, manifestLoading, downloadUrl }} />

      {/* Rename drawer */}
      <StandardDrawer
        isOpen={!!renamingDevice}
        onOpenChange={(open) => {
          if (!open) setRenamingDevice(null);
        }}
      >
        <DrawerHeader>
          <DrawerHeading className="text-lg font-semibold">{t('devices.rename.title')}</DrawerHeading>
        </DrawerHeader>
        <DrawerBody>
          <TextField
            value={renameValue}
            onChange={setRenameValue}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSave();
            }}
            autoFocus
          >
            <Label>{t('devices.rename.label', { name: renamingDevice?.name ?? '' })}</Label>
            <Input placeholder={t('devices.rename.placeholder')} />
          </TextField>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="ghost" onPress={() => setRenamingDevice(null)}>
            {t('devices.rename.cancel')}
          </Button>
          <Button variant="primary" isPending={isRenamePending} onPress={handleRenameSave}>
            {t('devices.rename.save')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>

      {/* Delete confirmation */}
      <DeleteConfirmationModal
        isOpen={!!deletingDevice}
        onClose={() => setDeletingDevice(null)}
        onConfirm={handleDeleteConfirm}
        itemName={deletingDevice?.name ?? ''}
        isDeleting={isDeleting}
      />
    </div>
  );
}

export default CompanionSettingsPage;
