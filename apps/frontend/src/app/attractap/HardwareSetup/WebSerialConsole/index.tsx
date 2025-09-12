import { Alert, Button, Modal, ModalBody, ModalContent, ModalHeader, useDisclosure } from '@heroui/react';
import { useCallback, useRef, useState } from 'react';
import { ESPTools, ESPToolsErrorType } from '../../../../utils/esp-tools';
import { PageHeader } from '../../../../components/pageHeader';
import { Terminal } from '../../../../components/Terminal';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function WebSerialConsole({ children }: Props) {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const { t } = useTranslations({
    de,
    en,
  });

  const [output, setOutput] = useState<string>('');
  const espTools = useRef<ESPTools>(ESPTools.getInstance());
  const [isConnected, setIsConnected] = useState<boolean>(espTools.current.isConnected);
  const [error, setError] = useState<{ type: ESPToolsErrorType; details?: unknown } | null>(null);
  const disconnectRef = useRef<() => void>();

  const onConnect = useCallback(async () => {
    const connectionResult = await espTools.current.connectToDevice();
    if (!connectionResult.success) {
      setError(connectionResult.error);
      return;
    }

    disconnectRef.current = await espTools.current.getSerialOutput((data: Uint8Array) => {
      const dataAsString = new TextDecoder().decode(data);
      setOutput((current) => current + dataAsString);
    });

    setError(null);
    setIsConnected(true);
  }, []);

  const onDisconnect = useCallback(() => {
    if (disconnectRef.current) {
      disconnectRef.current();
      disconnectRef.current = undefined;
    }
    setIsConnected(false);
  }, []);

  const onReset = useCallback(async () => {
    await espTools.current.hardReset();
  }, []);

  return (
    <>
      {children(onOpen)}

      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl">
        <ModalContent>
          <ModalHeader>
            <PageHeader title={t('title')} noMargin />
          </ModalHeader>

          <ModalBody>
            {!isConnected ? (
              <Button onPress={onConnect}>{t('actions.connect')}</Button>
            ) : (
              <Button onPress={onDisconnect}>{t('actions.disconnect')}</Button>
            )}

            {error && (
              <Alert color="danger" title={error.type}>
                {error.details as string}
              </Alert>
            )}

            {isConnected && (
              <>
                <Terminal logLines={output.split('\n')} maxHeight="30vh" />
                <Button color="warning" variant="light" onPress={onReset}>
                  {t('actions.reset')}
                </Button>
              </>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
