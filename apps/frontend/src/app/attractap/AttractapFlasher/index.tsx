import { Modal, ModalBody, ModalContent, ModalHeader, useDisclosure } from '@heroui/react';
import { Firmware } from '../types';
import { useEffect, useState } from 'react';
import { AttractapFlashButton } from '../AttractapFlashButton';

export function AttractapFlasher(props: { children: (onOpen: () => void) => React.ReactNode }) {
  const [firmwares, setFirmwares] = useState<Firmware[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch('/_attractap_assets/index.json')
      .then((response) => response.json())
      .then((data) => {
        setFirmwares(data.firmwares);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error('Error loading firmwares:', error);
        setIsLoading(false);
      });
  }, []);

  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  return (
    <>
      {props.children(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} data-cy="attractap-flasher-modal">
        <ModalContent>
          <ModalHeader>
            <h1 className="text-xl font-bold">Attractap Flasher</h1>
          </ModalHeader>
          <ModalBody className="space-y-4 pb-6">
            {isLoading ? (
              <div className="text-center py-6 text-gray-500">Loading available firmwares...</div>
            ) : firmwares.length === 0 ? (
              <div className="text-center py-6 text-gray-500">No firmwares available</div>
            ) : (
              firmwares.map((firmware) => (
                <div
                  key={firmware.environment}
                  className="border border-gray-700/20 dark:border-gray-600/30 rounded-lg p-5 bg-gray-50/50 dark:bg-gray-800/50 shadow-sm hover:shadow transition-shadow duration-200"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                        {firmware.friendly_name || firmware.environment}
                      </h2>
                      <div className="space-y-1 mt-2">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Version: {firmware.version}</p>
                        {firmware.board_family && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">Board: {firmware.board_family}</p>
                        )}
                      </div>
                    </div>
                    <AttractapFlashButton
                      firmware={firmware}
                      color="primary"
                      className="min-w-[120px]"
                      data-cy={`attractap-flasher-flash-button-${firmware.environment}`}
                    />
                  </div>
                </div>
              ))
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
