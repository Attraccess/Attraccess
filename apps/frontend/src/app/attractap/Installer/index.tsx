import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Modal, ModalBody, ModalContent, ModalHeader, useDisclosure } from '@heroui/react';
import { PageHeader } from '../../../components/pageHeader';
import { FirmwareSelector } from './FirmwareSelector';
import { useState } from 'react';
import { AttractapFirmware } from '@attraccess/react-query-client';

import de from './de.json';
import en from './en.json';
import { AttractapFlasher } from './Flasher';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function AttractapInstaller({ children }: Props) {
  const { t } = useTranslations('attractap.installer', {
    de,
    en,
  });

  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const [selectedFirmware, setSelectedFirmware] = useState<AttractapFirmware | null>(null);

  return (
    <>
      {children(onOpen)}

      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="5xl">
        <ModalContent>
          <ModalHeader>
            <PageHeader
              title={t('title')}
              subtitle={
                selectedFirmware
                  ? `${selectedFirmware?.friendlyName} - ${selectedFirmware?.variantFriendlyName}`
                  : undefined
              }
              noMargin
              onBack={selectedFirmware ? () => setSelectedFirmware(null) : undefined}
            />
          </ModalHeader>

          <ModalBody>
            {!selectedFirmware ? (
              <FirmwareSelector onSelect={setSelectedFirmware} />
            ) : (
              <AttractapFlasher firmware={selectedFirmware} />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
