import { Alert, Button, Modal, ModalBody, ModalContent, ModalHeader, useDisclosure } from "@heroui/react";
import { useCallback, useRef, useState } from "react";
import { ESPTools, ESPToolsErrorType } from "../../utils/esp-tools";
import { PageHeader } from "../pageHeader";
import { Terminal } from "../Terminal";
import { useTranslations } from "@attraccess/plugins-frontend-ui";

import de from './de.json';
import en from './en.json';

interface Props {
    children: (onOpen: () => void) => React.ReactNode;
    baudRate: number
}

export function WebSerialConsole({ children, baudRate }: Props) {
      const { isOpen, onOpen, onOpenChange } = useDisclosure();

      const {t} = useTranslations('webserialConsole', {
        de,
        en
      });

      const [output, setOutput] = useState<string>('');
      const [isConnected, setIsConnected] = useState<boolean>(false);
      const [error, setError] = useState<{type: ESPToolsErrorType, details?: unknown} | null>(null);
      const disconnectRef = useRef<() => void>();
      const port = useRef<SerialPort | null>(null);

      const onConnect = useCallback(async () => {
        const espTools = ESPTools.getInstance();
        const connectionResult = await espTools.connectToDevice();
        if (!connectionResult.success) {
            setError(connectionResult.error);
            return;
        }

        port.current = connectionResult.data as SerialPort;
        
        disconnectRef.current = await espTools.getSerialOutput(port.current, baudRate, (data: Uint8Array) => {
            const dataAsString = new TextDecoder().decode(data);
            setOutput((current) => current + dataAsString);
        });

        setError(null);
        setIsConnected(true);
      }, [baudRate]);

      const onDisconnect = useCallback(() => {
        if (disconnectRef.current) {
            disconnectRef.current();
            disconnectRef.current = undefined;
        }
        setIsConnected(false);
      }, []);

      const onReset = useCallback(async () => {
        if (!port.current) {
            return;
        }

        const espTools = ESPTools.getInstance();
        await espTools.hardReset(port.current);
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
                        ): (
                            <Button onPress={onDisconnect}>{t('actions.disconnect')}</Button>
                        )}

                        {error && <Alert color="danger" title={error.type}>{error.details as string}</Alert>}

                        {isConnected && (<>
                            <Terminal logLines={output.split('\n')} maxHeight="30vh"/>
                            <Button color="warning" variant="light" onPress={onReset}>{t('actions.reset')}</Button>
                        </>)}
                    </ModalBody>
                </ModalContent>
            </Modal>
        </>
    );
}