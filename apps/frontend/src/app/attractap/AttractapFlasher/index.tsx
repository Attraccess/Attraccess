import { Chip, Modal, ModalBody, ModalContent, ModalHeader, useDisclosure } from '@heroui/react';
import { AttractapFlashButton } from '../AttractapFlashButton';
import { useAttractapServiceGetFirmwares } from '@attraccess/react-query-client';

export function AttractapFlasher(props: { children: (onOpen: () => void) => React.ReactNode }) {
  const { data: firmwares, isLoading } = useAttractapServiceGetFirmwares();

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
            ) : firmwares?.length === 0 ? (
              <div className="text-center py-6 text-gray-500">No firmwares available</div>
            ) : (
              firmwares?.map((firmware) => (
                <div
                  key={firmware.name}
                  className="border border-gray-700/20 dark:border-gray-600/30 rounded-lg p-5 bg-gray-50/50 dark:bg-gray-800/50 shadow-sm hover:shadow transition-shadow duration-200"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{firmware.friendlyName}</h2>
                      <div className="flex flex-wrap gap-1">
                        {firmware.variantFriendlyName.split(',').map((variantPart) => (
                          <Chip size="sm">{variantPart}</Chip>
                        ))}
                      </div>
                      <div className="space-y-1 mt-2">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Version: {firmware.version}</p>
                        {firmware.boardFamily && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">Board: {firmware.boardFamily}</p>
                        )}
                      </div>
                    </div>
                    <AttractapFlashButton
                      firmware={firmware}
                      color="primary"
                      className="min-w-[120px]"
                      data-cy={`attractap-flasher-flash-button-${firmware.name}`}
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
