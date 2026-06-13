import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  SupervisionRequestDto,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  useResourcesServiceSupervisionApproveRequest,
  useResourcesServiceSupervisionListPendingRequests,
  useResourcesServiceSupervisionRejectRequest,
} from '@attraccess/react-query-client';
import { useAuth } from '../../hooks/useAuth';
import { useSSE } from '../../utils/sse';
import { useToastMessage } from '../toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { SupervisorApprovalModal } from './SupervisorApprovalModal';
import en from './translations/en.json';
import de from './translations/de.json';

/** Mirrors the backend SupervisionLiveEventType enum (delivered over SSE). */
enum SupervisionLiveEventType {
  REQUESTED = 'requested',
  EXPIRED = 'expired',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

interface SupervisionLiveEvent {
  type: SupervisionLiveEventType;
  requestId: string;
  request: SupervisionRequestDto | null;
}

/**
 * Global listener (mounted once for authenticated users) that surfaces incoming
 * supervised-start requests as a realtime popup. Approving starts the session;
 * the request auto-dismisses after the backend's 30s timeout.
 */
export function SupervisorApprovalListener() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const { t } = useTranslations({ en, de });

  const [requests, setRequests] = useState<SupervisionRequestDto[]>([]);

  // Seed from any requests already awaiting this supervisor (e.g. after reconnect).
  const { data: pending } = useResourcesServiceSupervisionListPendingRequests(undefined, {
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

  useSSE<SupervisionLiveEvent>({
    path: '/api/resources/supervision/requests/live',
    onUpdate: handleEvent,
    enabled: !!user,
  });

  const invalidateActiveSession = useCallback(
    (resourceId: number) => {
      queryClient.invalidateQueries({
        queryKey: UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }),
      });
    },
    [queryClient],
  );

  const { mutate: approveRequest, isPending: isApproving } = useResourcesServiceSupervisionApproveRequest();
  const { mutate: rejectRequest, isPending: isRejecting } = useResourcesServiceSupervisionRejectRequest();

  const activeRequest = requests[0];

  const handleApprove = useCallback(() => {
    if (!activeRequest) {
      return;
    }
    const { id, resourceId } = activeRequest;
    approveRequest(
      { requestId: id },
      {
        onSuccess: () => {
          invalidateActiveSession(resourceId);
          toast.success({ title: t('toast.approved.title'), description: t('toast.approved.description') });
          removeRequest(id);
        },
        onError: () => {
          toast.error({ title: t('toast.error.title'), description: t('toast.error.description') });
          removeRequest(id);
        },
      },
    );
  }, [activeRequest, approveRequest, invalidateActiveSession, removeRequest, t, toast]);

  const handleReject = useCallback(() => {
    if (!activeRequest) {
      return;
    }
    const { id } = activeRequest;
    rejectRequest(
      { requestId: id },
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
