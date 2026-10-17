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
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  AlertContent,
  AlertTitle,
  Chip,
  TableCell,
  TableRow,
} from '@heroui/react';
import { MonitorSmartphoneIcon, DownloadIcon, MonitorIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { PageHeader } from '../../../components/pageHeader/index';
import { Button } from '../../../components/button/index';
import { StandardDrawer } from '../../../components/standardDrawer';
import { EmptyState } from '../../../components/emptyState';
import { DeleteConfirmationModal } from '../../../components/deleteConfirmationModal/index';
import { ReactNode, useState } from 'react';
import {
  useCompanionDevicesServiceGetCompanionDevice,
  CompanionDevice,
  UseCompanionDevicesServiceListCompanionDevicesKeyFn,
  useCompanionDevicesServiceDeleteCompanionDevice,
  useCompanionDevicesServiceListCompanionDevices,
  useCompanionDevicesServiceRenameCompanionDevice,
  useCompanionServiceGetCompanionVersions,
} from '@attraccess/react-query-client';
import { lt, valid } from 'semver';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../components/toastProvider';
import { getBaseUrl } from '../../../api/index';
import en from './en.json';
import de from './de.json';

export type FormatDateTime = ReturnType<typeof useDateTimeFormatter>;

export interface DeviceRowProps {
  device: CompanionDevice;
  latestVersion: string | null;
  onRenameStart: (device: CompanionDevice) => void;
  onDeleteStart: (device: CompanionDevice) => void;
  t: (key: string) => string;
  formatDateTime: FormatDateTime;
}

export type DeviceWithConnected = CompanionDevice & { connected?: boolean };

export function isOutdated(deviceVersion: string, latestVersion: string): boolean {
  if (!valid(deviceVersion) || !valid(latestVersion)) return false;
  return lt(deviceVersion, latestVersion);
}

export function DeviceRow({ device, latestVersion, onRenameStart, onDeleteStart, t, formatDateTime }: DeviceRowProps) {
  const { data } = useCompanionDevicesServiceGetCompanionDevice({ id: device.id }, undefined, {
    refetchInterval: 30000,
  });
  const fetchedDevice = data as DeviceWithConnected | undefined;
  const isOnline = fetchedDevice?.connected ?? false;
  const appVersion = fetchedDevice?.appVersion ?? device.appVersion ?? null;
  const showUpdateBadge = appVersion !== null && latestVersion !== null && isOutdated(appVersion, latestVersion);

  return (
    <TableRow key={device.id} id={device.id}>
      <TableCell>{device.name}</TableCell>
      <TableCell>
        <Chip color={isOnline ? 'success' : 'default'} size="sm">
          {isOnline ? t('devices.status.online') : t('devices.status.offline')}
        </Chip>
      </TableCell>
      <TableCell className="whitespace-nowrap">{formatDateTime(device.lastConnection) as ReactNode}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span className="text-sm">{appVersion ?? '—'}</span>
          {showUpdateBadge && (
            <Chip color="warning" size="sm">
              {t('updateAvailable')}
            </Chip>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-row gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onPress={() => onRenameStart(device)}>
            <PencilIcon className="w-4 h-4" />
            {t('devices.actions.rename')}
          </Button>
          <Button variant="danger-soft" size="sm" onPress={() => onDeleteStart(device)}>
            <Trash2Icon className="w-4 h-4" />
            {t('devices.actions.delete')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function platformLabel(platform: string, arch: string): string {
  if (platform === 'win32' || platform === 'windows') return 'Windows x64';
  if (platform === 'darwin' || platform === 'macos') return 'macOS (Universal)';
  if (platform === 'linux' && arch === 'arm64') return 'Linux arm64';
  if (platform === 'linux') return 'Linux x64';
  return `${platform} ${arch}`;
}

export const SETUP_STEPS = ['download', 'run', 'url', 'register', 'name', 'flow'] as const;

export function useCompanionSettingsPageState() {
  const { t } = useTranslations({ en, de });
  const formatDateTime = useDateTimeFormatter();
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: devices, isLoading: devicesLoading } = useCompanionDevicesServiceListCompanionDevices(undefined, {
    refetchInterval: 30000,
  });
  const { data: manifest, isLoading: manifestLoading } = useCompanionServiceGetCompanionVersions();

  const [renamingDevice, setRenamingDevice] = useState<CompanionDevice | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingDevice, setDeletingDevice] = useState<CompanionDevice | null>(null);

  const listKey = UseCompanionDevicesServiceListCompanionDevicesKeyFn();

  const { mutate: rename, isPending: isRenamePending } = useCompanionDevicesServiceRenameCompanionDevice({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      setRenamingDevice(null);
      toast.success({ title: t('devices.rename.success') });
    },
    onError: () => {
      toast.error({ title: t('devices.rename.error') });
    },
  });

  const { mutate: deleteDevice, isPending: isDeleting } = useCompanionDevicesServiceDeleteCompanionDevice({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      setDeletingDevice(null);
      toast.success({ title: t('devices.delete.success') });
    },
    onError: () => {
      toast.error({ title: t('devices.delete.error') });
    },
  });

  const handleRenameStart = (device: CompanionDevice) => {
    setRenamingDevice(device);
    setRenameValue(device.name);
  };

  const handleRenameSave = () => {
    if (!renamingDevice || !renameValue.trim()) return;
    rename({ id: renamingDevice.id, requestBody: { name: renameValue.trim() } });
  };

  const handleDeleteConfirm = () => {
    if (!deletingDevice) return;
    deleteDevice({ id: deletingDevice.id });
  };

  const downloadUrl = (platform: string, arch: string) => `${getBaseUrl()}/api/companion/download/${platform}/${arch}`;
  return {
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
  } as const;
}

type Props = Pick<
  ReturnType<typeof useCompanionSettingsPageState>,
  't' | 'manifest' | 'manifestLoading' | 'downloadUrl'
>;

export function CompanionSettingsPageDownloadTitle({ t, manifest, manifestLoading, downloadUrl }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Download */}
      <Card>
        <Card.Header className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold">{t('download.title')}</span>
            {manifest && !manifestLoading && (manifest.platforms?.length ?? 0) > 0 && (
              <Chip color="success" size="sm">
                {t('version.label', { version: manifest.version })}
              </Chip>
            )}
          </div>
          <span className="text-sm text-default-500">{t('download.subtitle')}</span>
        </Card.Header>
        <Card.Content>
          {(!manifest || (manifest.platforms?.length ?? 0) === 0) && !manifestLoading ? (
            <Alert color="default">
              <AlertContent>
                <AlertTitle>{t('download.noBinaries')}</AlertTitle>
              </AlertContent>
            </Alert>
          ) : manifestLoading ? (
            <Spinner size="sm" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {manifest?.platforms.map((entry) => (
                <Card key={`${entry.platform}-${entry.arch}`} className="border border-divider">
                  <Card.Content className="flex flex-col items-center gap-3 py-4">
                    <MonitorIcon size={28} className="text-default-400" />
                    <span className="text-sm font-medium text-center">{platformLabel(entry.platform, entry.arch)}</span>
                    <a href={downloadUrl(entry.platform, entry.arch)} download={entry.filename} className="w-full">
                      <Button variant="primary" size="sm" className="w-full">
                        <DownloadIcon className="w-4 h-4" />
                        {t('download.button')}
                      </Button>
                    </a>
                  </Card.Content>
                </Card>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Setup Instructions */}
      <Card>
        <Card.Header className="flex flex-col items-start gap-1">
          <span className="text-base font-semibold">{t('setup.title')}</span>
          <span className="text-sm text-default-500">{t('setup.subtitle')}</span>
        </Card.Header>
        <Card.Content>
          <Accordion>
            {SETUP_STEPS.map((step, idx) => (
              <AccordionItem key={step} id={step} aria-label={t(`setup.steps.${step}.title`)}>
                <AccordionHeading>
                  <AccordionTrigger>
                    <span className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                        {idx + 1}
                      </span>
                      {t(`setup.steps.${step}.title`)}
                    </span>
                  </AccordionTrigger>
                </AccordionHeading>
                <AccordionPanel>
                  <AccordionBody>
                    <p className="text-sm text-default-600 ml-9">{t(`setup.steps.${step}.description`)}</p>
                  </AccordionBody>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </Card.Content>
      </Card>
    </div>
  );
}

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
