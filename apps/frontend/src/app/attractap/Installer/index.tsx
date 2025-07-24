import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Modal, ModalBody, ModalContent, ModalHeader, useDisclosure } from '@heroui/react';
import { PageHeader } from '../../../components/pageHeader';
import { FirmwareSelector } from './FirmwareSelector';
import { FirmwareFlasher } from './FirmwareFlasher';
import { useCallback, useState } from 'react';
import { AttractapFirmware } from '@attraccess/react-query-client';

import de from './de.json';
import en from './en.json';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function AttractapInstaller({ children }: Props) {
  const { t } = useTranslations('attractap.installer', {
    de,
    en,
  });

  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [state, setState] = useState<'select' | 'flash'>('select');

  const [selectedFirmware, setSelectedFirmware] = useState<AttractapFirmware | null>(null);

  const handleFlashingComplete = () => {
    // TODO: Transition to console view (task 11)
    onOpenChange();
  };

  const onBack = useCallback(() => {
    switch (state) {
      case 'select':
        onOpenChange();
        break;
      case 'flash':
        setState('select');
        break;
    }
  }, [state, onOpenChange]);

  return (
    <>
      {children(onOpen)}

      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
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
              onBack={onBack}
            />
          </ModalHeader>

          <ModalBody>
            {state === 'select' && (
              <FirmwareSelector onSelect={(firmware) => {
                setSelectedFirmware(firmware);
                setState('flash');
              }} />
            )}
            
            {state === 'flash' && (
              <FirmwareFlasher
                firmware={selectedFirmware as AttractapFirmware}
                onCompleted={handleFlashingComplete}
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
