import { ReactNode, useState } from 'react';
import {
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  AlertContent,
  AlertTitle,
  Card,
  Chip,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextField,
} from '@heroui/react';
import { DownloadIcon, MonitorIcon, MonitorSmartphoneIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import {
  CompanionDevice,
  UseCompanionDevicesServiceListCompanionDevicesKeyFn,
  useCompanionDevicesServiceDeleteCompanionDevice,
  useCompanionDevicesServiceGetCompanionDevice,
  useCompanionDevicesServiceListCompanionDevices,
  useCompanionDevicesServiceRenameCompanionDevice,
  useCompanionServiceGetCompanionVersions,
} from '@attraccess/react-query-client';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../components/pageHeader';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/emptyState';
import { DeleteConfirmationModal } from '../../../components/deleteConfirmationModal';
import { useToastMessage } from '../../../components/toastProvider';
import { getBaseUrl } from '../../../api';
import en from './en.json';
import de from './de.json';

type FormatDateTime = ReturnType<typeof useDateTimeFormatter>;

type DeviceWithConnected = CompanionDevice & { connected?: boolean };

function platformLabel(platform: string, arch: string): string {
  if (platform === 'win32' || platform === 'windows') return 'Windows x64';
  if (platform === 'darwin' || platform === 'macos') return 'macOS (Universal)';
  if (platform === 'linux' && arch === 'arm64') return 'Linux arm64';
  if (platform === 'linux') return 'Linux x64';
  return `${platform} ${arch}`;
}

interface DeviceRowProps {
  device: CompanionDevice;
  isRenaming: boolean;
  onRenameStart: (device: CompanionDevice) => void;
  onDeleteStart: (device: CompanionDevice) => void;
  t: (key: string) => string;
  formatDateTime: FormatDateTime;
}

function DeviceRow({ device, isRenaming, onRenameStart, onDeleteStart, t, formatDateTime }: DeviceRowProps) {
  const { data } = useCompanionDevicesServiceGetCompanionDevice({ id: device.id }, undefined, {
    refetchInterval: 30000,
  });
  const isOnline = (data as DeviceWithConnected | undefined)?.connected ?? false;

  return (
    <TableRow key={device.id} id={device.id} className={isRenaming ? 'bg-primary-50' : undefined}>
      <TableCell>{device.name}</TableCell>
      <TableCell>
        <Chip color={isOnline ? 'success' : 'default'} size="sm">
          {isOnline ? t('devices.status.online') : t('devices.status.offline')}
        </Chip>
      </TableCell>
      <TableCell className="whitespace-nowrap">{formatDateTime(device.lastConnection) as ReactNode}</TableCell>
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

const SETUP_STEPS = ['download', 'run', 'url', 'register', 'name', 'flow'] as const;

export function CompanionSettingsPage() {
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

  const downloadUrl = (platform: string, arch: string) =>
    `${getBaseUrl()}/api/companion/download/${platform}/${arch}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<MonitorSmartphoneIcon size={20} />}
      />

      {/* Registered Devices */}
      <Card>
        <Card.Header className="flex flex-col items-start gap-1">
          <span className="text-base font-semibold">{t('devices.title')}</span>
          <span className="text-sm text-default-500">{t('devices.subtitle')}</span>
        </Card.Header>
        <Card.Content>
          {renamingDevice && (
            <div className="flex flex-col gap-2 mb-4">
              <span className="text-sm text-default-500">
                {t('devices.rename.label', { name: renamingDevice.name })}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <TextField
                  value={renameValue}
                  onChange={setRenameValue}
                  className="max-w-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSave();
                    if (e.key === 'Escape') setRenamingDevice(null);
                  }}
                  autoFocus
                >
                  <Input placeholder={t('devices.rename.placeholder')} />
                </TextField>
                <Button size="sm" variant="primary" isPending={isRenamePending} onPress={handleRenameSave}>
                  {t('devices.rename.save')}
                </Button>
                <Button size="sm" variant="ghost" onPress={() => setRenamingDevice(null)}>
                  {t('devices.rename.cancel')}
                </Button>
              </div>
            </div>
          )}
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
                    <TableColumn>{t('devices.columns.actions')}</TableColumn>
                  </TableHeader>
                  <TableBody items={devices ?? []} renderEmptyState={() => <EmptyState />}>
                    {(device) => (
                      <DeviceRow
                        key={device.id}
                        device={device}
                        isRenaming={renamingDevice?.id === device.id}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Download */}
        <Card>
          <Card.Header className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-semibold">{t('download.title')}</span>
              {manifest && !manifestLoading && (
                <Chip color="success" size="sm">{t('version.label', { version: manifest.version })}</Chip>
              )}
            </div>
            <span className="text-sm text-default-500">{t('download.subtitle')}</span>
          </Card.Header>
          <Card.Content>
            {!manifest && !manifestLoading ? (
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
                      <span className="text-sm font-medium text-center">
                        {platformLabel(entry.platform, entry.arch)}
                      </span>
                      <a
                        href={downloadUrl(entry.platform, entry.arch)}
                        download={entry.filename}
                        className="w-full"
                      >
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
