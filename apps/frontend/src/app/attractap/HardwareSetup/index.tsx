import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, Button, Modal, ModalBody, ModalContent, ModalHeader, useDisclosure } from '@heroui/react';
import { PageHeader } from '../../../components/pageHeader';
import { FirmwareSelector } from './FirmwareSelector';
import { FirmwareFlasher } from './FirmwareFlasher';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AttractapFirmware } from '@attraccess/react-query-client';
import { AttractapSerialConfigurator } from './SerialConfigurator';
import { ConnectionStateEvent, ESPTools } from '../../../utils/esp-tools';

import de from './de.json';
import en from './en.json';

type State = 'init' | 'select' | 'flash' | 'configure';

interface ContentProps {
  state: State;
  setState: (state: State) => void;
  onClose: () => void;
  openDeviceSettings: (deviceId: string) => void;
}

function Content(props: ContentProps) {
  const { state, setState, openDeviceSettings } = props;

  const { t } = useTranslations('attractap.hardwareSetup', {
    de,
    en,
  });

  const espTools = useRef(ESPTools.getInstance());
  const [isConnected, setIsConnected] = useState(espTools.current.isConnected);

  useEffect(() => {
    const onConnectionState = (event: ConnectionStateEvent) => {
      setIsConnected(event.connected);
    };

    const tools = espTools.current;

    tools.on('connectionState', onConnectionState);

    return () => {
      if (!tools) {
        return;
      }

      tools.off('connectionState', onConnectionState);
    };
  }, []);

  const [selectedFirmware, setSelectedFirmware] = useState<AttractapFirmware | null>(null);

  if (!isConnected) {
    return (
      <Button color="primary" onPress={() => espTools.current.connectToDevice()}>
        {t('actions.connect')}
      </Button>
    );
  }

  if (state === 'init') {
    return (
      <>
        <Alert color="primary">{t('init.description')}</Alert>

        <Button onPress={() => setState('select')}>{t('init.actions.selectFirmware')}</Button>

        <Button onPress={() => setState('configure')}>{t('init.actions.configure')}</Button>
      </>
    );
  }

  if (state === 'select') {
    return (
      <FirmwareSelector
        onSelect={(firmware) => {
          setSelectedFirmware(firmware);
          setState('flash');
        }}
      />
    );
  }

  if (state === 'flash') {
    return (
      <FirmwareFlasher firmware={selectedFirmware as AttractapFirmware} onCompleted={() => setState('configure')} />
    );
  }

  if (state === 'configure') {
    return <AttractapSerialConfigurator openDeviceSettings={openDeviceSettings} />;
  }

  return null;
}

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
  openDeviceSettings: (deviceId: string) => void;
}

export function AttractapHardwareSetup(props: Props) {
  const { children, openDeviceSettings } = props;

  const { t } = useTranslations('attractap.hardwareSetup', {
    de,
    en,
  });

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [state, setState] = useState<State>('init');

  const onBack = useCallback(() => {
    switch (state) {
      case 'init':
        onOpenChange();
        break;

      case 'select':
        setState('init');
        break;
      case 'flash':
        setState('select');
        break;

      case 'configure':
        setState('init');
        break;
    }
  }, [state, onOpenChange]);

  return (
    <>
      {children(onOpen)}

      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size={state === 'configure' ? '5xl' : undefined}
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader>
            <PageHeader title={t('title.' + state)} subtitle={t('subtitle.' + state)} noMargin onBack={onBack} />
          </ModalHeader>

          <ModalBody className="mb-4">
            <Content
              state={state}
              setState={setState}
              onClose={onOpenChange}
              openDeviceSettings={(deviceId) => {
                onClose();
                openDeviceSettings(deviceId);
              }}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
