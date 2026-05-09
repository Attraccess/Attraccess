import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useResourcesServiceGetAllResources,
  useResourcesServiceResourceUsageEndSession,
  useResourcesServiceGetAllResourcesKey,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  ApiError,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { getTranslationKeyForApiError } from '../../../utils/apiError';
import en from './translations/en.json';
import de from './translations/de.json';
import { Check, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';

type ActiveUsageSessionsBannerProps = {
  onShowMySessions: () => void;
};

const ACTIVE_RESOURCES_PAGE_SIZE = 50;

export function ActiveUsageSessionsBanner({ onShowMySessions }: ActiveUsageSessionsBannerProps) {
  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: {
        ...API_ERROR_TRANSLATIONS_EN,
        ...en.apiErrors,
      },
    },
    de: {
      ...de,
      api: {
        ...API_ERROR_TRANSLATIONS_DE,
        ...de.apiErrors,
      },
    },
  });
  const queryClient = useQueryClient();
  const toast = useToastMessage();

  // Fetch just the total count (1 item per page is sufficient)
  const { data, isLoading, isFetching, refetch } = useResourcesServiceGetAllResources({
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
  const [endStatuses, setEndStatuses] = useState<Record<number, 'pending' | 'ending' | 'done' | 'error'>>({});
  const [endErrors, setEndErrors] = useState<Record<number, { title: string; description: string }>>({});
  const [allCompleted, setAllCompleted] = useState(false);
  const [cachedResources, setCachedResources] = useState<Array<{ id: number; name: string }>>([]);

  const {
    data: activeResourcesResponse,
    isLoading: isLoadingActiveResources,
    isFetching: isFetchingActiveResources,
  } = useResourcesServiceGetAllResources(
    { onlyInUseByMe: true, limit: ACTIVE_RESOURCES_PAGE_SIZE, page: 1 },
    undefined,
    {
      enabled: isModalOpen,
      refetchOnWindowFocus: false,
    },
  );

  const activeResources = useMemo(() => activeResourcesResponse?.data ?? [], [activeResourcesResponse]);
  const successfulResources = useMemo(
    () => cachedResources.filter((resource) => endStatuses[resource.id] === 'done'),
    [cachedResources, endStatuses],
  );

  const isLoadingResources =
    isModalOpen && (isLoadingActiveResources || (!cachedResources.length && isFetchingActiveResources));

  useEffect(() => {
    if (!isModalOpen) return;
    if (!activeResources.length) return;

    setCachedResources((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const merged = [...prev];
      activeResources.forEach((r) => {
        if (!seen.has(r.id)) {
          merged.push({ id: r.id, name: r.name });
        }
      });
      return merged;
    });

    setEndStatuses((prev) => {
      const next: typeof prev = { ...prev };
      activeResources.forEach((resource) => {
        if (!next[resource.id]) {
          next[resource.id] = 'pending';
        }
      });
      return next;
    });
  }, [activeResources, isModalOpen]);

  const openConfirmModal = useCallback(() => {
    if (activeCount === 0) return;
    setIsModalOpen(true);
    setAllCompleted(false);
    setEndStatuses({});
    setEndErrors({});
    setCachedResources([]);
  }, [activeCount]);

  const confirmEndAll = useCallback(async () => {
    if (isEndingAll || isLoadingResources || cachedResources.length === 0) return;
    setIsEndingAll(true);
    setEndErrors({});
    // Mark all as ending
    setEndStatuses((prev) => {
      const updated: typeof prev = { ...prev };
      cachedResources.forEach((r) => (updated[r.id] = 'ending'));
      return updated;
    });
    try {
      const results = await Promise.allSettled(
        cachedResources.map(async (r) => {
          try {
            await endSession({ resourceId: r.id, requestBody: {} });
            setEndStatuses((prev) => ({ ...prev, [r.id]: 'done' }));
            setEndErrors((prev) => {
              if (!(r.id in prev)) return prev;
              const { [r.id]: _removed, ...rest } = prev;
              return rest;
            });
          } catch (err) {
            console.error('Failed to end session for resource', r.id, err);
            const { key, errorMessage } = getTranslationKeyForApiError({
              baseTranslationKey: 'api',
              error: err as ApiError,
              t,
              tExists,
            });
            setEndStatuses((prev) => ({ ...prev, [r.id]: 'error' }));
            setEndErrors((prev) => ({
              ...prev,
              [r.id]: {
                title: t(`${key}.title`),
                description: t(`${key}.description`, { error: errorMessage }),
              },
            }));
            throw err;
          }
        }),
      );

      // Invalidate lists regardless of outcome
      await queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });

      // If all succeeded -> show completion state and auto-close
      const rejectedResults = results.filter((r) => r.status === 'rejected');
      if (rejectedResults.length === 0) {
        setAllCompleted(true);
        toast.success({ title: t('endedAll.success') });
        setTimeout(() => setIsModalOpen(false), 1000);
      }
    } finally {
      setIsEndingAll(false);
      refetch();
    }
  }, [cachedResources, endSession, isEndingAll, isLoadingResources, queryClient, refetch, t, tExists, toast]);

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
            <Button variant="primary" size="sm" onPress={onShowMySessions}>
              {t('showMine')}
            </Button>
            <Button variant="danger-soft" size="sm" onPress={openConfirmModal}>
              {t('endAll')}
            </Button>
          </div>
        </div>
      </Alert>

      <Modal
        isOpen={isModalOpen}
        onOpenChange={(open) => { if (!open && !isEndingAll) setIsModalOpen(false); }}
      >
        <ModalBackdrop isDismissable={!isEndingAll} />
        <ModalContainer size="lg">
          <ModalDialog>
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
                    <Spinner size="sm" /> {t('modal.loadingList')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-default-500">{t('modal.description')}</div>
                    {successfulResources.length > 0 && (
                      <Alert
                        color="success"
                        variant="flat"
                        title={t('modal.successListTitle', { count: successfulResources.length })}
                        className="text-sm"
                      >
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
                              <Alert color="danger" variant="flat" title={errorInfo.title} className="text-sm">
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
                    <Button variant="danger"
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
          </ModalDialog>
        </ModalContainer>
      </Modal>
    </div>
  );
}
