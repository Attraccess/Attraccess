import { useCallback, useEffect, useMemo, useState } from 'react';
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
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import { ActiveUsageSessionsBannerProps } from './index.active-usage-sessions-banner-props';
import { ACTIVE_RESOURCES_PAGE_SIZE } from './index.active-resources-page-size';
export function useActiveUsageSessionsBannerState({ onShowMySessions }: ActiveUsageSessionsBannerProps) {
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
  return {
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
    onShowMySessions,
  } as const;
}
