import { useState, useCallback, useMemo } from 'react';
import { Button, ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
import { UserX, ChevronDownIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AttraccessUser, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import {
  useResourcesServiceResourceUsageStartSession,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
  useResourcesServiceResourceUsageGetActiveSession,
  useResourcesServiceResourceUsageCanControl,
  useResourcesServiceGetOneResourceById,
  useAccessControlServiceResourceIntroducersIsIntroducer,
  useResourcesServiceResourceUsageEndSession,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../../hooks/useAuth';
import { useToastMessage } from '../../../../../components/toastProvider';
import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal';
import * as en from './translations/en.json';
import * as de from './translations/de.json';

interface OtherUserSessionDisplayProps {
  resourceId: number;
}

export function OtherUserSessionDisplay({ resourceId }: OtherUserSessionDisplayProps) {
  const { t } = useTranslations('otherUserSessionDisplay', { en, de });
  const { hasPermission, user } = useAuth();
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();
  const [isTakeoverNotesModalOpen, setIsTakeoverNotesModalOpen] = useState(false);
  const [isStopOtherUserSessionNotesModalOpen, setIsStopOtherUserSessionNotesModalOpen] = useState(false);

  const { data: activeSessionResponse } = useResourcesServiceResourceUsageGetActiveSession({ resourceId });
  const activeSession = useMemo(() => activeSessionResponse?.usage, [activeSessionResponse]);

  const { data: access } = useResourcesServiceResourceUsageCanControl({ resourceId });

  const { data: permissions } = useAccessControlServiceResourceIntroducersIsIntroducer(
    { resourceId, userId: user?.id as number, includeGroups: true },
    undefined,
    {
      enabled: !!user?.id,
    }
  );

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const canManageResources = hasPermission('canManageResources');
  const canStartSession = canManageResources || access?.canControl || permissions?.isIntroducer;
  const canTakeover = resource?.allowTakeOver && canStartSession;
  const canStopOtherUserSession = permissions?.isIntroducer || canManageResources;

  const startSession = useResourcesServiceResourceUsageStartSession({
    onSuccess: () => {
      setIsTakeoverNotesModalOpen(false);

      // Invalidate the active session query to refetch data
      queryClient.invalidateQueries({
        queryKey: UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }),
      });
      // Invalidate all history queries for this resource (regardless of pagination/user filters)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const baseHistoryKey = UseResourcesServiceResourceUsageGetHistoryKeyFn({ resourceId });
          return (
            query.queryKey[0] === baseHistoryKey[0] &&
            query.queryKey.length > 1 &&
            JSON.stringify(query.queryKey[1]).includes(`"resourceId":${resourceId}`)
          );
        },
      });
      success({
        title: t('takeover.successful'),
        description: t('takeover.successfulDescription'),
      });
    },
    onError: (err) => {
      showError({
        title: t('takeover.error'),
        description: t('takeover.errorDescription'),
      });
      console.error('Failed to takeover session:', err);
    },
  });

  const stopSession = useResourcesServiceResourceUsageEndSession({
    onSuccess: () => {
      setIsTakeoverNotesModalOpen(false);

      // Invalidate the active session query to refetch data
      queryClient.invalidateQueries({
        queryKey: UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }),
      });
      // Invalidate all history queries for this resource (regardless of pagination/user filters)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const baseHistoryKey = UseResourcesServiceResourceUsageGetHistoryKeyFn({ resourceId });
          return (
            query.queryKey[0] === baseHistoryKey[0] &&
            query.queryKey.length > 1 &&
            JSON.stringify(query.queryKey[1]).includes(`"resourceId":${resourceId}`)
          );
        },
      });

      success({
        title: t('stopOtherUserSession.successful'),
        description: t('stopOtherUserSession.successfulDescription'),
      });
    },
  });

  const handleStopOtherUserSessionWithNotes = async (notes: string) => {
    stopSession.mutate({
      resourceId,
      requestBody: { notes },
    });
  };

  const handleTakeoverWithNotes = async (notes: string) => {
    startSession.mutate({
      resourceId,
      requestBody: { notes, forceTakeOver: true },
    });
  };

  const handleImmediateTakeover = useCallback(() => {
    startSession.mutate({
      resourceId,
      requestBody: { forceTakeOver: true },
    });
  }, [startSession, resourceId]);

  const handleOpenTakeoverModal = () => {
    setIsTakeoverNotesModalOpen(true);
  };

  const handleOpenStopOtherUserSessionModal = () => {
    setIsStopOtherUserSessionNotesModalOpen(true);
  };

  const handleImmediateStopOtherUserSession = useCallback(() => {
    stopSession.mutate({
      resourceId,
      requestBody: {},
    });
  }, [stopSession, resourceId]);

  // Early return if no active session or it belongs to current user
  if (!activeSession || activeSession.userId === user?.id) {
    return null;
  }

  return (
    <>
      <div className="space-y-4 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('resourceInUseBy')}</p>
        {activeSession.user ? (
          <AttraccessUser user={activeSession.user} />
        ) : (
          <p className="text-sm font-medium text-gray-900 dark:text-white">{t('unknownUser')}</p>
        )}

        <p className="text-xs text-gray-400 dark:text-gray-500">
          ({t('sessionStarted')} <DateTimeDisplay date={activeSession.startTime} />)
        </p>

        {canTakeover && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t('takeover.available')}</p>
            <ButtonGroup fullWidth color="warning">
              <Button
                isLoading={startSession.isPending}
                startContent={<UserX className="w-4 h-4" />}
                onPress={handleImmediateTakeover}
              >
                {t('takeover.button')}
              </Button>
              <Dropdown placement="bottom-end">
                <DropdownTrigger>
                  <Button isIconOnly>
                    <ChevronDownIcon />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu disallowEmptySelection aria-label={t('takeover.optionsMenu.label')}>
                  <DropdownItem
                    key="takeoverWithNotes"
                    description={t('takeover.optionsMenu.takeoverWithNotes.description')}
                    onPress={handleOpenTakeoverModal}
                  >
                    {t('takeover.optionsMenu.takeoverWithNotes.label')}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </ButtonGroup>
          </div>
        )}

        {canStopOtherUserSession && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t('stopOtherUserSession.available')}</p>
            <ButtonGroup fullWidth color="danger">
              <Button
                isLoading={startSession.isPending}
                startContent={<UserX className="w-4 h-4" />}
                onPress={handleImmediateStopOtherUserSession}
              >
                {t('stopOtherUserSession.button')}
              </Button>
              <Dropdown placement="bottom-end">
                <DropdownTrigger>
                  <Button isIconOnly>
                    <ChevronDownIcon />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu disallowEmptySelection aria-label={t('stopOtherUserSession.optionsMenu.label')}>
                  <DropdownItem
                    key="stopOtherUserSessionWithNotes"
                    description={t('stopOtherUserSession.optionsMenu.stopOtherUserSessionWithNotes.description')}
                    onPress={handleOpenStopOtherUserSessionModal}
                  >
                    {t('stopOtherUserSession.optionsMenu.stopOtherUserSessionWithNotes.label')}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </ButtonGroup>
          </div>
        )}
      </div>

      <SessionNotesModal
        isOpen={isTakeoverNotesModalOpen}
        onClose={() => setIsTakeoverNotesModalOpen(false)}
        onConfirm={handleTakeoverWithNotes}
        mode={SessionModalMode.START}
        isSubmitting={startSession.isPending}
      />

      <SessionNotesModal
        isOpen={isStopOtherUserSessionNotesModalOpen}
        onClose={() => setIsStopOtherUserSessionNotesModalOpen(false)}
        onConfirm={handleStopOtherUserSessionWithNotes}
        mode={SessionModalMode.END}
        isSubmitting={stopSession.isPending}
      />
    </>
  );
}
