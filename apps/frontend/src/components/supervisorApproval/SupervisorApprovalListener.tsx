import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  SupervisionRequestDto,
  UseResourceUsageGetActiveSessionKeyFn,
  useSupervisionApproveRequest,
  useSupervisionListPendingRequests,
  useSupervisionRejectRequest,
} from '@attraccess/react-query-client';
import { useAuth } from '../../hooks/useAuth';
import { useLiveUpdates } from '../../utils/live-updates';
import { useToastMessage } from '../toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { SupervisorApprovalModal } from './SupervisorApprovalModal';
import { useRefreshNetworkRestrictionOnError } from '../../hooks/useRefreshNetworkRestrictionOnError';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import en from './translations/en.json';
import de from './translations/de.json';

import { SupervisionLiveEvent, SupervisionLiveEventType } from '../../utils/live-updates/types';

/**
 * Global listener (mounted once for authenticated users) that surfaces incoming
 * supervised-start requests as a realtime popup. Approving starts the session;
 * the request auto-dismisses after the backend's 30s timeout.
 */
export function SupervisorApprovalListener() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const refreshNetworkRestriction = useRefreshNetworkRestrictionOnError();
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });

  const [requests, setRequests] = useState<SupervisionRequestDto[]>([]);

  // Seed from any requests already awaiting this supervisor (e.g. after reconnect).
  const { data: pending } = useSupervisionListPendingRequests({}, undefined, {
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!pending) {
      return;
    }
    // The server's pending list is authoritative: drop locally tracked requests
    // it no longer reports (e.g. ones that missed an EXPIRED/RESOLVED/REJECTED
    // SSE event), while keeping the existing order and any newer entries.
    setRequests((prev) => {
      const pendingList = pending as SupervisionRequestDto[];
      const pendingById = new Map(pendingList.map((request) => [request.id, request]));
      const kept = prev
        .filter((request) => pendingById.has(request.id))
        .map((request) => pendingById.get(request.id) as SupervisionRequestDto);
      const keptIds = new Set(kept.map((request) => request.id));
      const added = pendingList.filter((request) => !keptIds.has(request.id));
      return [...kept, ...added];
    });
  }, [pending]);

  const removeRequest = useCallback((requestId: string) => {
    setRequests((prev) => prev.filter((request) => request.id !== requestId));
  }, []);

  const handleEvent = useCallback(
    (event: SupervisionLiveEvent) => {
      if (event.type === SupervisionLiveEventType.REQUESTED && event.request) {
        const incoming = event.request;
        setRequests((prev) => {
          if (prev.some((request) => request.id === incoming.id)) {
            return prev;
          }
          return [...prev, incoming];
        });
        return;
      }

      // EXPIRED / RESOLVED / REJECTED: the request is no longer actionable.
      removeRequest(event.requestId);
    },
    [removeRequest],
  );

  useLiveUpdates({
    topic: 'supervision',
    onUpdate: handleEvent,
    enabled: !!user,
  });

  const invalidateActiveSession = useCallback(
    (resourceId: number) => {
      queryClient.invalidateQueries({
        queryKey: UseResourceUsageGetActiveSessionKeyFn({ path: { resourceId } }),
      });
    },
    [queryClient],
  );

  const { mutate: approveRequest, isPending: isApproving } = useSupervisionApproveRequest();
  const { mutate: rejectRequest, isPending: isRejecting } = useSupervisionRejectRequest();

  const activeRequest = requests[0];

  const handleApprove = useCallback(() => {
    if (!activeRequest) {
      return;
    }
    const { id, resourceId } = activeRequest;
    approveRequest(
      { path: { requestId: id } },
      {
        onSuccess: () => {
          invalidateActiveSession(resourceId);
          toast.success({ title: t('toast.approved.title'), description: t('toast.approved.description') });
          removeRequest(id);
        },
        onError: (error) => {
          // The user's network changed since the popup opened: say so, and keep the request for another try.
          if (refreshNetworkRestriction(error)) {
            toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
            return;
          }
          toast.error({ title: t('toast.error.title'), description: t('toast.error.description') });
          removeRequest(id);
        },
      },
    );
  }, [
    activeRequest,
    approveRequest,
    invalidateActiveSession,
    refreshNetworkRestriction,
    removeRequest,
    t,
    tExists,
    toast,
  ]);

  const handleReject = useCallback(() => {
    if (!activeRequest) {
      return;
    }
    const { id } = activeRequest;
    rejectRequest(
      { path: { requestId: id } },
      {
        onSettled: () => removeRequest(id),
      },
    );
  }, [activeRequest, rejectRequest, removeRequest]);

  const handleExpire = useCallback(() => {
    if (activeRequest) {
      removeRequest(activeRequest.id);
    }
  }, [activeRequest, removeRequest]);

  if (!user || !activeRequest) {
    return null;
  }

  return (
    <SupervisorApprovalModal
      key={activeRequest.id}
      request={activeRequest}
      onApprove={handleApprove}
      onReject={handleReject}
      onIgnore={() => removeRequest(activeRequest.id)}
      onExpire={handleExpire}
      isApproving={isApproving}
      isRejecting={isRejecting}
    />
  );
}
