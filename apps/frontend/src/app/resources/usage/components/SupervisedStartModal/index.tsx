import { DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading } from '@heroui/react';
import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRefreshNetworkRestrictionOnError } from '../../../../../hooks/useRefreshNetworkRestrictionOnError';
import { Button, StandardDrawer, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  Attractap,
  ResourceIntroducerType,
  ResourceUsage,
  useResourceIntroducersGetNames,
  useGetReaders,
  useResourceUsageRequestSupervisedSession,
  RequestSupervisedSessionDto,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../../hooks/useAuth';
import { useToastMessage } from '../../../../../components/toastProvider';
import { cardWritingBlocker, pairedReadersOnly } from '../../../../attractap/cardWriting';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import en from './translations/en.json';
import de from './translations/de.json';
import { type Phase, SupervisedStartBody } from './SupervisedStartBody';

/** The 30s supervisor-approval window, mirrored from the backend. */
export const APPROVAL_TIMEOUT_SECONDS = 30;

export interface SupervisedStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceId: number;
  /** The start payload gathered from the normal start flow, minus the approval channel. */
  requestBody: Omit<RequestSupervisedSessionDto, 'supervisorUserId' | 'readerId'>;
  onApproved: (session: ResourceUsage) => void;
}

export function SupervisedStartModal({
  isOpen,
  onClose,
  resourceId,
  requestBody,
  onApproved,
}: Readonly<SupervisedStartModalProps>) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const refreshNetworkRestriction = useRefreshNetworkRestrictionOnError();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('select');
  const [secondsLeft, setSecondsLeft] = useState(APPROVAL_TIMEOUT_SECONDS);
  const [waitingAtReader, setWaitingAtReader] = useState<string | null>(null);

  // Only introducers may supervise, excluding the requester themselves.
  const { data: candidates, isLoading: isLoadingCandidates } = useResourceIntroducersGetNames({ path: { resourceId } });

  const supervisors = useMemo(
    () =>
      (candidates ?? []).filter(
        (candidate) => candidate.role === ResourceIntroducerType.INTRODUCER && candidate.userId !== user?.id,
      ),
    [candidates, user?.id],
  );

  const { data: allReaders } = useGetReaders();

  const { resourceReaders, otherReaders } = useMemo(() => {
    // Supervision runs on the reader's screen and relays the introducer's card, like card writing:
    // the server refuses readers without a display or on firmware before 2.0.0.
    const capable = pairedReadersOnly(allReaders).filter((reader) => cardWritingBlocker(reader) === null);
    return {
      resourceReaders: capable.filter((reader) => reader.resources?.some((r) => r.id === resourceId)),
      otherReaders: capable.filter((reader) => !reader.resources?.some((r) => r.id === resourceId)),
    };
  }, [allReaders, resourceId]);

  const { mutate: requestSupervisedSession } = useResourceUsageRequestSupervisedSession();

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
        { path: { resourceId }, body: { ...requestBody, ...channel } },
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
            // A network restriction is a 403 too, but nobody was asked: it is an error of the request itself.
            const isNetworkRestricted = refreshNetworkRestriction(error);
            if (status === 403 && !isNetworkRestricted) {
              setPhase('rejected');
              return;
            }
            setPhase('error');
            // Say why, e.g. READER_FIRMWARE_UPDATE_REQUIRED, READER_BUSY or READER_OFFLINE.
            toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
          },
        },
      );
    },
    [onApproved, refreshNetworkRestriction, requestBody, requestSupervisedSession, resourceId, t, tExists, toast],
  );

  const handleSelectSupervisor = useCallback(
    (supervisorUserId: number) => submitRequest({ supervisorUserId }),
    [submitRequest],
  );

  const handleSelectReader = useCallback(
    (reader: Attractap) => submitRequest({ readerId: reader.id }, reader.name),
    [submitRequest],
  );

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <DrawerHeading className="text-lg font-semibold">{t('title')}</DrawerHeading>
          <Button
            isIconOnly
            variant="ghost"
            aria-label={t('cancel')}
            onPress={onClose}
            isDisabled={phase === 'waiting'}
          >
            <X size={16} />
          </Button>
        </div>
      </DrawerHeader>

      <DrawerBody>
        <SupervisedStartBody
          phase={phase}
          waitingAtReader={waitingAtReader}
          secondsLeft={secondsLeft}
          isLoadingCandidates={isLoadingCandidates}
          supervisors={supervisors}
          resourceReaders={resourceReaders}
          otherReaders={otherReaders}
          onSelectSupervisor={handleSelectSupervisor}
          onSelectReader={handleSelectReader}
        />
      </DrawerBody>

      <DrawerFooter>
        {(phase === 'timeout' || phase === 'rejected' || phase === 'error') && (
          <Button variant="primary" onPress={() => setPhase('select')}>
            {t('retry')}
          </Button>
        )}
        <Button variant="ghost" onPress={onClose} isDisabled={phase === 'waiting'}>
          {t('cancel')}
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
