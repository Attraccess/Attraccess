import { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ResourcesService,
  useResourcesServiceGetAllResources,
  useResourcesServiceResourceUsageEndSession,
  useResourcesServiceGetAllResourcesKey,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/en.json';
import de from './translations/de.json';
import { Check, CheckCircle2, Loader2, XCircle } from 'lucide-react';

type ActiveUsageSessionsBannerProps = {
  onShowMySessions: () => void;
};

export function ActiveUsageSessionsBanner({ onShowMySessions }: ActiveUsageSessionsBannerProps) {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const { success, error: showError } = useToastMessage();

  // Fetch just the total count (1 item per page is sufficient)
  const { data, isLoading, isFetching } = useResourcesServiceGetAllResources({
    onlyInUseByMe: true,
    page: 1,
    limit: 1,
  });

  const activeCount = useMemo(() => data?.total ?? 0, [data?.total]);

  const [isEndingAll, setIsEndingAll] = useState(false);
  const { mutateAsync: endSession } = useResourcesServiceResourceUsageEndSession({
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId: data.resourceId }),
      });
    },
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [resourcesInUse, setResourcesInUse] = useState<Array<{ id: number; name: string }>>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [endStatuses, setEndStatuses] = useState<Record<number, 'pending' | 'ending' | 'done' | 'error'>>({});
  const [allCompleted, setAllCompleted] = useState(false);

  const openConfirmModal = useCallback(async () => {
    if (activeCount === 0) return;
    setIsModalOpen(true);
    setAllCompleted(false);
    setEndStatuses({});
    setResourcesInUse([]);
    setIsLoadingResources(true);
    try {
      // Load all resources currently in use by me
      const pageSize = 50;
      let page = 1;
      const collected: Array<{ id: number; name: string }> = [];
      while (true) {
        const resp = await ResourcesService.getAllResources({
          onlyInUseByMe: true,
          page,
          limit: pageSize,
        });
        const items = resp.data ?? [];
        collected.push(...items.map((r) => ({ id: r.id, name: r.name })));
        if (items.length < pageSize) break;
        page += 1;
      }
      setResourcesInUse(collected);
      // Initialize statuses as pending
      setEndStatuses(collected.reduce((acc, r) => ({ ...acc, [r.id]: 'pending' }), {}));
    } catch (e) {
      console.error(e);
      showError({ title: t('endedAllError') });
    } finally {
      setIsLoadingResources(false);
    }
  }, [activeCount, showError, t]);

  const confirmEndAll = useCallback(async () => {
    if (isEndingAll || resourcesInUse.length === 0) return;
    setIsEndingAll(true);
    // Mark all as ending
    setEndStatuses((prev) => {
      const updated: typeof prev = { ...prev };
      resourcesInUse.forEach((r) => (updated[r.id] = 'ending'));
      return updated;
    });
    try {
      const localStatuses: Record<number, 'done' | 'error'> = {};
      await Promise.all(
        resourcesInUse.map(async (r) => {
          try {
            await endSession({ resourceId: r.id, requestBody: {} });
            localStatuses[r.id] = 'done';
            setEndStatuses((prev) => ({ ...prev, [r.id]: 'done' }));
          } catch (err) {
            console.error('Failed to end session for resource', r.id, err);
            localStatuses[r.id] = 'error';
            setEndStatuses((prev) => ({ ...prev, [r.id]: 'error' }));
          }
        }),
      );

      // Invalidate lists regardless of outcome
      await queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });

      // If all succeeded -> show completion state and auto-close
      const allSucceeded = resourcesInUse.every((r) => localStatuses[r.id] === 'done');
      if (allSucceeded) {
        setAllCompleted(true);
        success({ title: t('endedAllSuccess') });
        setTimeout(() => setIsModalOpen(false), 1000);
      } else {
        showError({ title: t('endedAllError') });
      }
    } finally {
      setIsEndingAll(false);
    }
  }, [endSession, isEndingAll, queryClient, resourcesInUse, success, showError, t]);

  if (isLoading || isFetching) {
    return (
      <div className="mb-4">
        <Alert color="secondary" title={t('loadingTitle')}>
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
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
      <Alert color="warning" title={t('title', { count: activeCount })}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 w-full">
          <div className="flex flex-1">{t('description', { count: activeCount })}</div>
          <div className="flex flex-shrink gap-2">
            <Button color="primary" size="sm" onPress={onShowMySessions}>
              {t('showMine')}
            </Button>
            <Button color="danger" size="sm" variant="flat" onPress={openConfirmModal}>
              {t('endAll')}
            </Button>
          </div>
        </div>
      </Alert>

      <Modal
        isOpen={isModalOpen}
        onClose={() => (!isEndingAll ? setIsModalOpen(false) : undefined)}
        isDismissable={!isEndingAll}
        size="lg"
      >
        <ModalContent>
          {(onClose) => (
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
                    <Spinner size="sm" /> {t('modal.loadingList')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-default-500">{t('modal.description')}</div>
                    <ul className="space-y-1">
                      {resourcesInUse.map((r) => {
                        const status = endStatuses[r.id] ?? 'pending';
                        return (
                          <li key={r.id} className="flex items-center gap-2">
                            {status === 'ending' && <Loader2 className="h-4 w-4 animate-spin text-warning" />}
                            {status === 'done' && <Check className="h-4 w-4 text-success" />}
                            {status === 'error' && <XCircle className="h-4 w-4 text-danger" />}
                            <span>{r.name}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </ModalBody>
              {!allCompleted && (
                <ModalFooter>
                  <Button variant="light" onPress={onClose} isDisabled={isEndingAll}>
                    {t('modal.cancel')}
                  </Button>
                  <Button color="danger" isLoading={isEndingAll} onPress={confirmEndAll}>
                    {t('modal.confirm')}
                  </Button>
                </ModalFooter>
              )}
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
