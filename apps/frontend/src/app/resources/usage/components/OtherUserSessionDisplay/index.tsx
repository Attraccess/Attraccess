import { ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownPopover } from '@heroui/react';
import { SessionStatusCard } from '../SessionStatusCard';
import { Button } from '../../../../../components/button';
import { buttonVariants } from '@heroui/styles';
import { UserX, ChevronDownIcon, MessageCircle } from 'lucide-react';
import { AttraccessUser, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal';
import { useOtherUserSessionDisplayState } from './useOtherUserSessionDisplayState';

export interface OtherUserSessionDisplayProps {
  resourceId: number;
}

export function OtherUserSessionDisplay({ resourceId }: OtherUserSessionDisplayProps) {
  const {
    t,
    user,
    isTakeoverNotesModalOpen,
    setIsTakeoverNotesModalOpen,
    isStopOtherUserSessionNotesModalOpen,
    setIsStopOtherUserSessionNotesModalOpen,
    formsModal,
    activeSession,
    canTakeover,
    canStopOtherUserSession,
    startSession,
    stopSession,
    contactHolder,
    handleContactHolder,
    handleStopOtherUserSessionWithNotes,
    handleTakeoverWithNotes,
    handleImmediateTakeover,
    handleOpenTakeoverModal,
    handleOpenStopOtherUserSessionModal,
    handleImmediateStopOtherUserSession,
  } = useOtherUserSessionDisplayState({ resourceId });

  // Early return if no active session or it belongs to current user
  if (!activeSession || activeSession.userId === user?.id) {
    return null;
  }

  return (
    <>
      <SessionStatusCard
        accent="warning"
        statusLabel={t('inUse')}
        centerStatus
        bodyClassName="text-center"
        data-cy="other-user-session-card"
        chipDataCy="other-user-in-use-chip"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('resourceInUseBy')}</p>
        <div className="flex justify-center">
          {activeSession.user ? (
            <AttraccessUser user={activeSession.user} />
          ) : (
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t('unknownUser')}</p>
          )}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500">
          ({t('sessionStarted')} <DateTimeDisplay date={activeSession.startTime} />)
        </p>

        {activeSession.supervisorUser && (
          <div className="space-y-1 flex flex-col items-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('supervisedBy')}:</p>
            <AttraccessUser user={activeSession.supervisorUser} />
          </div>
        )}

        <div>
          <Button
            variant="ghost"
            size="sm"
            isPending={contactHolder.isPending}
            onPress={handleContactHolder}
            data-cy="contact-current-user-button"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {t('contact.button')}
          </Button>
        </div>

        {canTakeover && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t('takeover.available')}</p>
            <ButtonGroup className="w-full">
              <Button variant="danger-soft" isPending={startSession.isPending} onPress={handleImmediateTakeover}>
                <UserX className="w-4 h-4" />
                {t('takeover.button')}
              </Button>
              <Dropdown>
                <DropdownTrigger
                  className={`${buttonVariants({ isIconOnly: true, variant: 'danger-soft' })} inline-flex items-center justify-center`}
                >
                  <ChevronDownIcon />
                </DropdownTrigger>
                <DropdownPopover>
                  <DropdownMenu aria-label={t('takeover.optionsMenu.label')}>
                    <DropdownItem key="takeoverWithNotes" id="takeoverWithNotes" onPress={handleOpenTakeoverModal}>
                      {t('takeover.optionsMenu.takeoverWithNotes.label')}
                    </DropdownItem>
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            </ButtonGroup>
          </div>
        )}

        {canStopOtherUserSession && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t('stopOtherUserSession.available')}</p>
            <ButtonGroup className="w-full">
              <Button variant="danger" isPending={startSession.isPending} onPress={handleImmediateStopOtherUserSession}>
                <UserX className="w-4 h-4" />
                {t('stopOtherUserSession.button')}
              </Button>
              <Dropdown>
                <DropdownTrigger
                  className={`${buttonVariants({ isIconOnly: true, variant: 'danger' })} inline-flex items-center justify-center`}
                >
                  <ChevronDownIcon />
                </DropdownTrigger>
                <DropdownPopover>
                  <DropdownMenu aria-label={t('stopOtherUserSession.optionsMenu.label')}>
                    <DropdownItem
                      key="stopOtherUserSessionWithNotes"
                      id="stopOtherUserSessionWithNotes"
                      onPress={handleOpenStopOtherUserSessionModal}
                    >
                      {t('stopOtherUserSession.optionsMenu.stopOtherUserSessionWithNotes.label')}
                    </DropdownItem>
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            </ButtonGroup>
          </div>
        )}
      </SessionStatusCard>

      <SessionNotesModal
        isOpen={isTakeoverNotesModalOpen}
        onClose={() => setIsTakeoverNotesModalOpen(false)}
        onConfirm={(notes) => void handleTakeoverWithNotes(notes)}
        mode={SessionModalMode.START}
        isSubmitting={startSession.isPending}
      />

      <SessionNotesModal
        isOpen={isStopOtherUserSessionNotesModalOpen}
        onClose={() => setIsStopOtherUserSessionNotesModalOpen(false)}
        onConfirm={(notes) => void handleStopOtherUserSessionWithNotes(notes)}
        mode={SessionModalMode.END}
        isSubmitting={stopSession.isPending}
      />
      {formsModal}
    </>
  );
}
