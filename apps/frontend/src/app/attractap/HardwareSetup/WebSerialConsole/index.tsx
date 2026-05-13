import {
  Alert,
  AlertContent,
  AlertTitle,
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalHeading,
  useOverlayState,
} from '@heroui/react';
import { useCallback, useRef, useState } from 'react';
import { ESPTools, ESPToolsErrorType } from '../../../../utils/esp-tools';
import { Terminal } from '../../../../components/Terminal';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function WebSerialConsole({ children }: Props) {
  const { isOpen, open, setOpen } = useOverlayState();

  const { t } = useTranslations({
    de,
    en,
  });

  const [output, setOutput] = useState<string>('');
  const espTools = useRef<ESPTools>(ESPTools.getInstance());
  const [isConnected, setIsConnected] = useState<boolean>(espTools.current.isConnected);
  const [error, setError] = useState<{ type: ESPToolsErrorType; details?: unknown } | null>(null);
  const disconnectRef = useRef<(() => void) | null>(null);

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
      disconnectRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const onReset = useCallback(async () => {
    await espTools.current.hardReset();
  }, []);

  return (
    <>
      {children(open)}

      <Modal isOpen={isOpen} onOpenChange={setOpen}>
        <ModalBackdrop>
          <ModalContainer size="lg">
            <ModalDialog>
              {() => (
                <>
                  <ModalHeader>
                    <ModalHeading>{t('title')}</ModalHeading>
                  </ModalHeader>

                  <ModalBody>
                    {!isConnected ? (
                      <Button onPress={onConnect}>{t('actions.connect')}</Button>
                    ) : (
                      <Button onPress={onDisconnect}>{t('actions.disconnect')}</Button>
                    )}

                    {error && (
                      <Alert status="danger">
                        <AlertContent>
                          <AlertTitle>{error.type}</AlertTitle>
                        </AlertContent>
                        {error.details as string}
                      </Alert>
                    )}

                    {isConnected && (
                      <>
                        <Terminal logLines={output.split('\n')} maxHeight="30vh" />
                        <Button variant="tertiary" onPress={onReset}>
                          {t('actions.reset')}
                        </Button>
                      </>
                    )}
                  </ModalBody>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  );
}
