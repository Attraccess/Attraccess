import { Button, ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PairingDto } from '@attraccess/react-query-client';
import { StandardModal } from '../../../components/standardModal';
import { PairingRow } from './PairingRow';
import de from './de.json';
import en from './en.json';

/** Readers that announced themselves and are not bound to a record or already being paired. */
export function devicesWaiting(pairings: PairingDto[] | undefined) {
  return (pairings ?? []).filter((p) => p.boundReaderId === null && p.state === 'announced' && !p.mode);
}

/** Lets the admin choose which waiting reader takes over an existing record. */
export function DevicePicker(
  props: Readonly<{
    title: string | null;
    devices: PairingDto[];
    onPick: (pairingId: string) => void;
    onClose: () => void;
  }>,
) {
  const { t } = useTranslations({ de, en });
  const format = useDateTimeFormatter();
  return (
    <StandardModal isOpen={props.title !== null} onOpenChange={(open) => !open && props.onClose()} size="md">
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{props.title}</ModalHeading>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-3" data-cy="attractap-device-picker">
            <p className="text-sm text-default-500">{t('picker.description')}</p>
            {props.devices.length === 0 && <p>{t('picker.empty')}</p>}
            {props.devices.map((device) => (
              <PairingRow
                key={device.id}
                kind={device.kind}
                name={t('toPair.newReader')}
                detail={t('toPair.waitingSince', { time: format(device.createdAt) })}
                action={
                  <Button
                    size="sm"
                    onPress={() => props.onPick(device.id)}
                    data-cy={`attractap-use-device-${device.id}`}
                  >
                    {t('picker.use')}
                  </Button>
                }
              />
            ))}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onPress={close}>
              {t('dialog.cancel')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
