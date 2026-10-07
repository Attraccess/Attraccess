import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  Attractap,
  ResourceIntroducerType,
  ResourceUsage,
  useAccessControlServiceResourceIntroducersGetMany,
  useAttractapServiceGetReaders,
  useResourcesServiceResourceUsageRequestSupervisedSession,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../../hooks/useAuth';
import en from './translations/en.json';
import de from './translations/de.json';
import { APPROVAL_TIMEOUT_SECONDS } from './index.approval-timeout-seconds';
import { Phase } from './index.contracts';
import { SupervisedStartModalProps } from './index.contracts';

export function useSupervisedStartModalStateInputs({
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
  const [waitingAtReader, setWaitingAtReader] = useState<string | null>(null);

  // Only introducers may supervise, excluding the requester themselves.
  const { data: candidates, isLoading: isLoadingCandidates } = useAccessControlServiceResourceIntroducersGetMany({
    resourceId,
  });

  const supervisors = useMemo(
    () =>
      (candidates ?? []).filter(
        (candidate) =>
          candidate.type === ResourceIntroducerType.INTRODUCER && candidate.userId !== user?.id && candidate.user,
      ),
    [candidates, user?.id],
  );

  const { data: allReaders } = useAttractapServiceGetReaders();

  const { resourceReaders, otherReaders } = useMemo(() => {
    const capable = (allReaders ?? []).filter((reader) => reader.firmware?.capabilities?.cardEnrollment);
    return {
      resourceReaders: capable.filter((reader) => reader.resources?.some((r) => r.id === resourceId)),
      otherReaders: capable.filter((reader) => !reader.resources?.some((r) => r.id === resourceId)),
    };
  }, [allReaders, resourceId]);

  const { mutate: requestSupervisedSession } = useResourcesServiceResourceUsageRequestSupervisedSession();

  // Reset to the selection phase whenever the modal is (re)opened.
  useEffect(() => {
    if (isOpen) {
      setPhase('select');
      setSecondsLeft(APPROVAL_TIMEOUT_SECONDS);
      setWaitingAtReader(null);
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

  const submitRequest = useCallback(
    (channel: { supervisorUserId: number } | { readerId: number }, readerName?: string) => {
      setWaitingAtReader(readerName ?? null);
      setPhase('waiting');
      requestSupervisedSession(
        { resourceId, requestBody: { ...requestBody, ...channel } },
        {
          onSuccess: (session) => {
            onApproved(session as ResourceUsage);
          },
          onError: (error) => {
            const status = error instanceof ApiError ? error.status : 0;
            if (status === 408) {
              setPhase('timeout');
              return;
            }
            // 403 covers both an explicit rejection and an unauthorized supervisor. Everything else
            // — offline, busy or unsupported reader, and anything unexpected — is the request
            // failing to land, which is a different story from a supervisor saying no.
            setPhase(status === 403 ? 'rejected' : 'error');
          },
        },
      );
    },
    [onApproved, requestBody, requestSupervisedSession, resourceId],
  );

  const handleSelectSupervisor = useCallback(
    (supervisorUserId: number) => submitRequest({ supervisorUserId }),
    [submitRequest],
  );

  const handleSelectReader = useCallback(
    (reader: Attractap) => submitRequest({ readerId: reader.id }, reader.name),
    [submitRequest],
  );
  return {
    t,
    user,
    phase,
    setPhase,
    secondsLeft,
    setSecondsLeft,
    waitingAtReader,
    setWaitingAtReader,
    candidates,
    isLoadingCandidates,
    supervisors,
    allReaders,
    resourceReaders,
    otherReaders,
    requestSupervisedSession,
    submitRequest,
    handleSelectSupervisor,
    handleSelectReader,
    isOpen,
    onClose,
    resourceId,
    requestBody,
    onApproved,
  } as const;
}
