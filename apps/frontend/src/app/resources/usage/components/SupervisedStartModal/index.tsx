import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  AlertContent,
  AlertDescription,
  Description,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Label,
  Spinner,
} from '@heroui/react';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Nfc, X } from 'lucide-react';
import {
  ApiError,
  Attractap,
  RequestSupervisedSessionDto,
  ResourceIntroducerType,
  ResourceUsage,
  useAccessControlServiceResourceIntroducersGetMany,
  useAttractapServiceGetReaders,
  useResourcesServiceResourceUsageRequestSupervisedSession,
} from '@attraccess/react-query-client';
import { Button } from '../../../../../components/button';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { useAuth } from '../../../../../hooks/useAuth';
import en from './translations/en.json';
import de from './translations/de.json';

/** The 30s supervisor-approval window, mirrored from the backend. */
const APPROVAL_TIMEOUT_SECONDS = 30;

type Phase = 'select' | 'waiting' | 'timeout' | 'rejected' | 'error';

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
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('select');
  const [secondsLeft, setSecondsLeft] = useState(APPROVAL_TIMEOUT_SECONDS);
  const [waitingAtReader, setWaitingAtReader] = useState<string | null>(null);

  // Authorized supervisors are the resource's introducers and maintainers,
  // excluding the requester themselves (self-supervision is rejected by the backend).
  const { data: candidates, isLoading: isLoadingCandidates } = useAccessControlServiceResourceIntroducersGetMany({
    resourceId,
  });

  const supervisors = useMemo(
    () => (candidates ?? []).filter((candidate) => candidate.userId !== user?.id),
    [candidates, user?.id],
  );

  const { data: allReaders } = useAttractapServiceGetReaders();

  // Supervision is drawn entirely on the reader's screen, so display-less readers cannot run it.
  // The resource's own readers come first; the rest are one disclosure away for the case where the
  // supervisor happens to be standing at a different one.
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
            if (error instanceof ApiError && error.status === 408) {
              setPhase('timeout');
              return;
            }
            // A reader that is offline, busy or unsupported fails immediately — that is a different
            // story from a supervisor saying no, so don't dress it up as a rejection.
            if (error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 409)) {
              setPhase('error');
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

  const handleSelectSupervisor = useCallback(
    (supervisorUserId: number) => submitRequest({ supervisorUserId }),
    [submitRequest],
  );

  const handleSelectReader = useCallback(
    (reader: Attractap) => submitRequest({ readerId: reader.id }, reader.name),
    [submitRequest],
  );

  const renderReaderButton = (reader: Attractap) => (
    <Button
      key={reader.id}
      variant="outline"
      className="h-auto w-full justify-start py-2"
      onPress={() => handleSelectReader(reader)}
    >
      <Nfc size={16} className="shrink-0" />
      <span className="truncate">{reader.name}</span>
    </Button>
  );

  const renderBody = () => {
    if (phase === 'waiting') {
      return (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <Spinner color="accent" />
          <Description>
            {waitingAtReader ? t('waiting.atReader', { reader: waitingAtReader }) : t('waiting.description')}
          </Description>
          <p className="text-3xl font-semibold tabular-nums">{t('waiting.countdown', { seconds: secondsLeft })}</p>
        </div>
      );
    }

    if (phase === 'timeout' || phase === 'rejected' || phase === 'error') {
      return (
        <div className="space-y-4">
          <Alert status="warning">
            <AlertStatusIcon status="warning" />
            <AlertContent>
              <AlertDescription>{t(`${phase}.description`)}</AlertDescription>
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
      <div className="space-y-5">
        <Description>{t('select.description')}</Description>

        <div className="space-y-2">
          <Label>{t('select.people')}</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

        {resourceReaders.length + otherReaders.length > 0 && (
          <div className="space-y-2">
            <Label>{t('select.readers')}</Label>
            <Description>{t('select.readerHint')}</Description>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{resourceReaders.map(renderReaderButton)}</div>
            {otherReaders.length > 0 && (
              <Accordion>
                <AccordionItem id="other-readers" aria-label={t('select.otherReaders')}>
                  <AccordionHeading>
                    <AccordionTrigger>{t('select.otherReaders')}</AccordionTrigger>
                  </AccordionHeading>
                  <AccordionPanel>
                    <AccordionBody>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {otherReaders.map(renderReaderButton)}
                      </div>
                    </AccordionBody>
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('title')}</h2>
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

      <DrawerBody>{renderBody()}</DrawerBody>

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
