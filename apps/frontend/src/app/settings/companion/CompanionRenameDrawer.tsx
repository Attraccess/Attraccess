import { DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading, Input, Label, TextField } from '@heroui/react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, StandardDrawer, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  CompanionDevice,
  UseCompanionDevicesServiceListCompanionDevicesKeyFn,
  useCompanionDevicesServiceRenameCompanionDevice,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

interface CompanionRenameDrawerProps {
  device: CompanionDevice | null;
  onClose: () => void;
}

export function CompanionRenameDrawer({ device, onClose }: CompanionRenameDrawerProps) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const [renameValue, setRenameValue] = useState('');
  const [startedDevice, setStartedDevice] = useState<CompanionDevice | null>(null);
  // Each time a device is picked, the field starts from its current name.
  if (device !== startedDevice) {
    setStartedDevice(device);
    if (device) setRenameValue(device.name);
  }

  const { mutate: rename, isPending: isRenamePending } = useCompanionDevicesServiceRenameCompanionDevice({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseCompanionDevicesServiceListCompanionDevicesKeyFn() });
      onClose();
      toast.success({ title: t('devices.rename.success') });
    },
    onError: () => {
      toast.error({ title: t('devices.rename.error') });
    },
  });

  const handleRenameSave = () => {
    if (!device || !renameValue.trim()) return;
    rename({ id: device.id, requestBody: { name: renameValue.trim() } });
  };

  return (
    <StandardDrawer
      isOpen={!!device}
      onOpenChange={(open) => {
        if (!open) onClose();
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
          <Label>{t('devices.rename.label', { name: device?.name ?? '' })}</Label>
          <Input placeholder={t('devices.rename.placeholder')} />
        </TextField>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="ghost" onPress={onClose}>
          {t('devices.rename.cancel')}
        </Button>
        <Button variant="primary" isPending={isRenamePending} onPress={handleRenameSave}>
          {t('devices.rename.save')}
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
