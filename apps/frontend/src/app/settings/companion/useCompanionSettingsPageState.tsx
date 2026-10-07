import { useState } from 'react';
import {
  CompanionDevice,
  UseCompanionDevicesServiceListCompanionDevicesKeyFn,
  useCompanionDevicesServiceDeleteCompanionDevice,
  useCompanionDevicesServiceListCompanionDevices,
  useCompanionDevicesServiceRenameCompanionDevice,
  useCompanionServiceGetCompanionVersions,
} from '@attraccess/react-query-client';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../components/toastProvider';
import { getBaseUrl } from '../../../api';
import en from './en.json';
import de from './de.json';

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
