import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Description,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
} from '@heroui/react';
import { StandardModal } from '../../../../../components/standardModal';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  RequestSupervisedSessionDto,
  ResourceIntroducerType,
  ResourceUsage,
  useAccessControlServiceResourceIntroducersGetMany,
  useResourcesServiceResourceUsageRequestSupervisedSession,
} from '@attraccess/react-query-client';
import { Button } from '../../../../../components/button';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { useAuth } from '../../../../../hooks/useAuth';
import en from './translations/en.json';
import de from './translations/de.json';

/** The 30s supervisor-approval window, mirrored from the backend. */
const APPROVAL_TIMEOUT_SECONDS = 30;

type Phase = 'select' | 'waiting' | 'timeout' | 'rejected';

export interface SupervisedStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceId: number;
  /** The start payload gathered from the normal start flow, minus the supervisor. */
  requestBody: Omit<RequestSupervisedSessionDto, 'supervisorUserId'>;
  onApproved: (session: ResourceUsage) => void;
}

export function SupervisedStartModal({
  isOpen,
  onClose,
  resourceId,
  requestBody,
  onApproved,
}: Readonly<SupervisedStartModalProps>) {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('select');
  const [secondsLeft, setSecondsLeft] = useState(APPROVAL_TIMEOUT_SECONDS);

  // Authorized supervisors are the resource's introducers and maintainers,
  // excluding the requester themselves (self-supervision is rejected by the backend).
  const { data: candidates, isLoading: isLoadingCandidates } = useAccessControlServiceResourceIntroducersGetMany({
    resourceId,
  });

  const supervisors = useMemo(
    () => (candidates ?? []).filter((candidate) => candidate.userId !== user?.id),
    [candidates, user?.id],
  );

  const { mutate: requestSupervisedSession } = useResourcesServiceResourceUsageRequestSupervisedSession();

  // Reset to the selection phase whenever the modal is (re)opened.
  useEffect(() => {
    if (isOpen) {
      setPhase('select');
      setSecondsLeft(APPROVAL_TIMEOUT_SECONDS);
    }
  }, [isOpen]);

  // Countdown while waiting for the supervisor to respond.
  useEffect(() => {
    if (phase !== 'waiting') {
      return;
    }

    setSecondsLeft(APPROVAL_TIMEOUT_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  const handleSelectSupervisor = useCallback(
    (supervisorUserId: number) => {
      setPhase('waiting');
      requestSupervisedSession(
        { resourceId, requestBody: { ...requestBody, supervisorUserId } },
        {
          onSuccess: (session) => {
            onApproved(session as ResourceUsage);
          },
          onError: (error) => {
            if (error instanceof ApiError && error.status === 408) {
              setPhase('timeout');
              return;
            }
            // 403 covers both an explicit rejection and an unauthorized supervisor.
            setPhase('rejected');
          },
        },
      );
    },
    [onApproved, requestBody, requestSupervisedSession, resourceId],
  );

  const renderBody = () => {
    if (phase === 'waiting') {
      return (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <Spinner color="accent" />
          <Description>{t('waiting.description')}</Description>
          <p className="text-3xl font-semibold tabular-nums">{t('waiting.countdown', { seconds: secondsLeft })}</p>
        </div>
      );
    }

    if (phase === 'timeout' || phase === 'rejected') {
      return (
        <div className="space-y-4">
          <Alert status="warning">
            <AlertStatusIcon status="warning" />
            <AlertContent>
              <AlertDescription>
                {phase === 'timeout' ? t('timeout.description') : t('rejected.description')}
              </AlertDescription>
            </AlertContent>
          </Alert>
        </div>
      );
    }

    if (isLoadingCandidates) {
      return (
        <div className="flex justify-center py-4">
          <Spinner color="accent" />
        </div>
      );
    }

    if (supervisors.length === 0) {
      return <Description>{t('select.empty')}</Description>;
    }

    return (
      <div className="space-y-3">
        <Description>{t('select.description')}</Description>
        <div className="space-y-2">
          {supervisors.map((supervisor) => (
            <Button
              key={supervisor.id}
              variant="outline"
              className="h-auto w-full justify-start py-2"
              onPress={() => handleSelectSupervisor(supervisor.userId)}
            >
              <AttraccessUser
                user={supervisor.user}
                description={
                  supervisor.type === ResourceIntroducerType.INTRODUCER
                    ? t('select.role.introducer')
                    : t('select.role.maintainer')
                }
              />
            </Button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="md"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t('title')}</ModalHeading>
          </ModalHeader>

          <ModalBody>{renderBody()}</ModalBody>

          <ModalFooter>
            {(phase === 'timeout' || phase === 'rejected') && (
              <Button variant="primary" onPress={() => setPhase('select')}>
                {t('retry')}
              </Button>
            )}
            <Button variant="ghost" onPress={close} isDisabled={phase === 'waiting'}>
              {t('cancel')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
