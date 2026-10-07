import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from '@heroui/react';
import { StandardModal } from '../../../components/standardModal';
import { Button } from '../../../components/button';
import { Check, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { ActiveUsageSessionsBannerProps } from './index.active-usage-sessions-banner-props';
import { useActiveUsageSessionsBannerState } from './useActiveUsageSessionsBannerState';

export function ActiveUsageSessionsBanner({ onShowMySessions }: ActiveUsageSessionsBannerProps) {
  const {
    t,
    isLoading,
    isFetching,
    activeCount,
    isEndingAll,
    isModalOpen,
    setIsModalOpen,
    endStatuses,
    endErrors,
    allCompleted,
    activeResources,
    successfulResources,
    isLoadingResources,
    openConfirmModal,
    confirmEndAll,
  } = useActiveUsageSessionsBannerState({ onShowMySessions });

  if (isLoading || isFetching) {
    return (
      <div className="mb-4">
        <Alert status="default">
          <AlertContent>
            <AlertTitle>{t('loadingTitle')}</AlertTitle>
          </AlertContent>
          <div className="flex items-center gap-2">
            <Spinner />
            <span>{t('loadingDescription')}</span>
          </div>
        </Alert>
      </div>
    );
  }

  // Keep component mounted while modal is open to allow success state to show
  const hideBanner = activeCount === 0 && !isModalOpen;
  if (hideBanner) {
    return null;
  }

  return (
    <div className="mb-4">
      <Alert status="warning">
        <AlertContent>
          <AlertTitle>{t('title', { count: activeCount })}</AlertTitle>
          <AlertDescription>{t('description', { count: activeCount })}</AlertDescription>
          <div className="mt-2 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="primary" onPress={onShowMySessions}>
              {t('showMine')}
            </Button>
            <Button variant="danger-soft" onPress={openConfirmModal}>
              {t('endAll')}
            </Button>
          </div>
        </AlertContent>
      </Alert>

      <StandardModal
        isOpen={isModalOpen}
        onOpenChange={(open) => {
          if (!open && !isEndingAll) setIsModalOpen(false);
        }}
        size="md"
      >
        {({ close }) => (
          <>
            <ModalHeader>
              {allCompleted ? (
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-500" /> {t('modal.completedTitle')}
                </div>
              ) : (
                t('modal.title')
              )}
            </ModalHeader>
            <ModalBody>
              {allCompleted ? (
                <div className="flex flex-col items-center justify-center py-6 gap-3">
                  <CheckCircle2 className="h-16 w-16 text-green-500" />
                </div>
              ) : isLoadingResources ? (
                <div className="flex items-center gap-2 py-2">
                  <Spinner /> {t('modal.loadingList')}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-default-500">{t('modal.description')}</div>
                  {successfulResources.length > 0 && (
                    <Alert status="success" className="text-sm">
                      <AlertContent>
                        <AlertTitle>{t('modal.successListTitle', { count: successfulResources.length })}</AlertTitle>
                      </AlertContent>
                      <div className="text-xs text-success-600">
                        {successfulResources.map((r) => r.name).join(', ')}
                      </div>
                    </Alert>
                  )}
                  <ul className="space-y-2">
                    {activeResources.map((r) => {
                      const status = endStatuses[r.id] ?? 'pending';
                      const errorInfo = endErrors[r.id];
                      return (
                        <li key={r.id} className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {status === 'ending' && <Loader2 className="h-4 w-4 animate-spin text-warning" />}
                            {status === 'done' && <Check className="h-4 w-4 text-success" />}
                            {status === 'error' && <XCircle className="h-4 w-4 text-danger" />}
                            <span>{r.name}</span>
                          </div>
                          {status === 'error' && errorInfo && (
                            <Alert status="danger" className="text-sm">
                              <AlertContent>
                                <AlertTitle>{errorInfo.title}</AlertTitle>
                              </AlertContent>
                              <div className="text-xs text-danger-500">{errorInfo.description}</div>
                            </Alert>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </ModalBody>
            {!allCompleted && (
              <ModalFooter>
                <Button variant="ghost" onPress={close} isDisabled={isEndingAll}>
                  {t('modal.cancel')}
                </Button>
                <Button
                  variant="danger"
                  isPending={isEndingAll}
                  isDisabled={isLoadingResources || activeResources.length === 0}
                  onPress={confirmEndAll}
                >
                  {t('modal.confirm')}
                </Button>
              </ModalFooter>
            )}
          </>
        )}
      </StandardModal>
    </div>
  );
}
