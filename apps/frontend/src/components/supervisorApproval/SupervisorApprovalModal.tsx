import { useEffect, useState } from 'react';
import {
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
} from '@heroui/react';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import { SupervisionRequestDto, User, useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { Button } from '../button';
import en from './translations/en.json';
import de from './translations/de.json';

export interface SupervisorApprovalModalProps {
  request: SupervisionRequestDto;
  onApprove: () => void;
  onReject: () => void;
  /** Called when the local countdown reaches zero (in sync with the backend timeout). */
  onExpire: () => void;
  isApproving: boolean;
  isRejecting: boolean;
}

function secondsUntil(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - new Date().getTime()) / 1000));
}

export function SupervisorApprovalModal({
  request,
  onApprove,
  onReject,
  onExpire,
  isApproving,
  isRejecting,
}: Readonly<SupervisorApprovalModalProps>) {
  const { t } = useTranslations({ en, de });
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(request.expiresAt));

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: request.resourceId });

  useEffect(() => {
    setSecondsLeft(secondsUntil(request.expiresAt));

    const interval = setInterval(() => {
      const remaining = secondsUntil(request.expiresAt);
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [request.expiresAt, request.id, onExpire]);

  const isBusy = isApproving || isRejecting;

  return (
    <Modal isOpen={true}>
      <ModalBackdrop>
        <ModalContainer size="md">
          <ModalDialog>
            {() => (
              <>
                <ModalHeader>
                  <ModalHeading>{t('title')}</ModalHeading>
                </ModalHeader>

                <ModalBody>
                  <div className="space-y-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {t('description', { resource: resource?.name ?? '' })}
                    </p>

                    <AttraccessUser
                      user={
                        {
                          id: request.requesterUserId,
                          username: request.requesterUsername,
                        } as unknown as User
                      }
                      description={t('requesterRole')}
                    />

                    {request.notes ? (
                      <div className="rounded-md bg-gray-50 dark:bg-gray-800 p-2">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('notesLabel')}</p>
                        <p className="text-sm text-gray-800 dark:text-gray-200">{request.notes}</p>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
                      <Spinner color="accent" size="sm" />
                      <span className="tabular-nums">{t('countdown', { seconds: secondsLeft })}</span>
                    </div>
                  </div>
                </ModalBody>

                <ModalFooter>
                  <Button variant="danger" onPress={onReject} isPending={isRejecting} isDisabled={isBusy}>
                    {t('reject')}
                  </Button>
                  <Button variant="primary" onPress={onApprove} isPending={isApproving} isDisabled={isBusy}>
                    {t('approve')}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
