import { useCallback, useState } from 'react';
import {
  useAccessControlServiceResourceGroupIntroducersGrant,
  useAccessControlServiceResourceGroupIntroducersRevoke,
  useAccessControlServiceResourceGroupIntroductionsGrant,
  useAccessControlServiceResourceGroupIntroductionsRevoke,
  useAccessControlServiceResourceIntroducersGrant,
  useAccessControlServiceResourceIntroducersRevoke,
  useAccessControlServiceResourceIntroductionsGrant,
  useAccessControlServiceResourceIntroductionsRevoke,
  ResourceIntroducerType,
  useAccessControlServiceResourceIntroductionsGetPeopleKey,
  UseAccessControlServiceResourceIntroductionsGetPeopleKeyFn,
  UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn,
  UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn,
  UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn,
  UseAccessControlServiceResourceIntroducersGetManyKeyFn,
  UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn,
  UseAccessControlServiceResourceIntroductionsGetManyKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../components/toastProvider';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { PeopleTarget } from './types';

export interface Params {
  target: PeopleTarget;
  t: TFunction;
}

export interface PeopleMutations {
  grantIntroducer: (userId: number) => Promise<void>;
  grantMaintainer: (userId: number) => Promise<void>;
  revokeIntroducer: (userId: number, type: ResourceIntroducerType) => Promise<void>;
  grantIntroduction: (userId: number, comment?: string) => Promise<void>;
  revokeIntroduction: (userId: number, comment?: string) => Promise<void>;
  pendingIntroducer: { userId: number; type: ResourceIntroducerType } | null;
  pendingIntroductionUserId: number | null;
  isGrantingIntroducer: boolean;
  isRevokingIntroducer: boolean;
  isGrantingIntroduction: boolean;
  isRevokingIntroduction: boolean;
  isMutating: boolean;
}

/** Refreshes the people table (and one user's history) after introductions changed for the target. */
export function useInvalidatePeopleIntroductions(target: PeopleTarget) {
  const queryClient = useQueryClient();
  const isResource = target.type === 'resource';
  return useCallback(
    (userId?: number) => {
      const listKey = isResource
        ? UseAccessControlServiceResourceIntroductionsGetManyKeyFn({ resourceId: target.id })
        : UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn({ groupId: target.id });
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({
        queryKey: isResource
          ? UseAccessControlServiceResourceIntroductionsGetPeopleKeyFn({ resourceId: target.id })
          : [useAccessControlServiceResourceIntroductionsGetPeopleKey],
      });
      if (userId !== undefined) {
        const historyKey = isResource
          ? UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId: target.id, userId })
          : UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn({ groupId: target.id, userId });
        queryClient.invalidateQueries({ queryKey: historyKey });
      }
    },
    [queryClient, target.id, isResource],
  );
}

/** Grant and revoke introducers, maintainers and introductions for a resource or resource group, with toasts. */
export function usePeopleMutations({ target, t }: Params): PeopleMutations {
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const isResource = target.type === 'resource';

  const [pendingIntroducer, setPendingIntroducer] = useState<{ userId: number; type: ResourceIntroducerType } | null>(
    null,
  );
  const [pendingIntroductionUserId, setPendingIntroductionUserId] = useState<number | null>(null);

  const invalidateIntroducers = useCallback(() => {
    const queryKey = isResource
      ? UseAccessControlServiceResourceIntroducersGetManyKeyFn({ resourceId: target.id })
      : UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn({ groupId: target.id });
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, target.id, isResource]);

  const invalidateIntroductions = useInvalidatePeopleIntroductions(target);

  const grantIntroducerToasts = {
    onSuccess: (_data: unknown, variables: { requestBody?: { type?: ResourceIntroducerType } }) => {
      const isMaintainer = variables?.requestBody?.type === ResourceIntroducerType.MAINTAINER;
      toast.success({
        title: isMaintainer ? t('toasts.maintainerGranted.title') : t('toasts.introducerGranted.title'),
        description: isMaintainer
          ? t('toasts.maintainerGranted.description')
          : t('toasts.introducerGranted.description'),
      });
      invalidateIntroducers();
    },
    onError: (err: Error) => {
      toast.error({
        title: t('toasts.introducerGrantFailed.title'),
        description: t('toasts.introducerGrantFailed.description', { error: err.message }),
      });
    },
  };

  const revokeIntroducerToasts = {
    onSuccess: (_data: unknown, variables: { requestBody?: { type?: ResourceIntroducerType } }) => {
      const isMaintainer = variables?.requestBody?.type === ResourceIntroducerType.MAINTAINER;
      toast.success({
        title: isMaintainer ? t('toasts.maintainerRevoked.title') : t('toasts.introducerRevoked.title'),
        description: isMaintainer
          ? t('toasts.maintainerRevoked.description')
          : t('toasts.introducerRevoked.description'),
      });
      invalidateIntroducers();
    },
    onError: (err: Error) => {
      toast.error({
        title: t('toasts.introducerRevokeFailed.title'),
        description: t('toasts.introducerRevokeFailed.description', { error: err.message }),
      });
    },
  };

  const grantIntroductionToasts = {
    onSuccess: (_data: unknown, variables: { userId: number }) => {
      toast.success({
        title: t('toasts.introductionGranted.title'),
        description: t('toasts.introductionGranted.description'),
      });
      invalidateIntroductions(variables.userId);
    },
    onError: (err: Error) => {
      toast.error({
        title: t('toasts.introductionGrantFailed.title'),
        description: t('toasts.introductionGrantFailed.description', { error: err.message }),
      });
    },
  };

  const revokeIntroductionToasts = {
    onSuccess: (_data: unknown, variables: { userId: number }) => {
      toast.success({
        title: t('toasts.introductionRevoked.title'),
        description: t('toasts.introductionRevoked.description'),
      });
      invalidateIntroductions(variables.userId);
    },
    onError: (err: Error) => {
      toast.error({
        title: t('toasts.introductionRevokeFailed.title'),
        description: t('toasts.introductionRevokeFailed.description', { error: err.message }),
      });
    },
  };

  const { mutateAsync: grantResourceIntroducerMut, isPending: isGrantingResourceIntroducer } =
    useAccessControlServiceResourceIntroducersGrant(grantIntroducerToasts);
  const { mutateAsync: revokeResourceIntroducerMut, isPending: isRevokingResourceIntroducer } =
    useAccessControlServiceResourceIntroducersRevoke(revokeIntroducerToasts);
  const { mutateAsync: grantResourceIntroductionMut, isPending: isGrantingResourceIntroduction } =
    useAccessControlServiceResourceIntroductionsGrant(grantIntroductionToasts);
  const { mutateAsync: revokeResourceIntroductionMut, isPending: isRevokingResourceIntroduction } =
    useAccessControlServiceResourceIntroductionsRevoke(revokeIntroductionToasts);

  const { mutateAsync: grantGroupIntroducerMut, isPending: isGrantingGroupIntroducer } =
    useAccessControlServiceResourceGroupIntroducersGrant(grantIntroducerToasts);
  const { mutateAsync: revokeGroupIntroducerMut, isPending: isRevokingGroupIntroducer } =
    useAccessControlServiceResourceGroupIntroducersRevoke(revokeIntroducerToasts);
  const { mutateAsync: grantGroupIntroductionMut, isPending: isGrantingGroupIntroduction } =
    useAccessControlServiceResourceGroupIntroductionsGrant(grantIntroductionToasts);
  const { mutateAsync: revokeGroupIntroductionMut, isPending: isRevokingGroupIntroduction } =
    useAccessControlServiceResourceGroupIntroductionsRevoke(revokeIntroductionToasts);

  const isGrantingIntroducer = isResource ? isGrantingResourceIntroducer : isGrantingGroupIntroducer;
  const isRevokingIntroducer = isResource ? isRevokingResourceIntroducer : isRevokingGroupIntroducer;
  const isGrantingIntroduction = isResource ? isGrantingResourceIntroduction : isGrantingGroupIntroduction;
  const isRevokingIntroduction = isResource ? isRevokingResourceIntroduction : isRevokingGroupIntroduction;

  const grantIntroducerRow = useCallback(
    async (userId: number, type: ResourceIntroducerType) => {
      setPendingIntroducer({ userId, type });
      try {
        if (isResource) {
          await grantResourceIntroducerMut({ resourceId: target.id, userId, requestBody: { type } });
        } else {
          await grantGroupIntroducerMut({ groupId: target.id, userId, requestBody: { type } });
        }
      } finally {
        setPendingIntroducer(null);
      }
    },
    [grantResourceIntroducerMut, grantGroupIntroducerMut, isResource, target.id, setPendingIntroducer],
  );

  const grantIntroducer = useCallback(
    (userId: number) => grantIntroducerRow(userId, ResourceIntroducerType.INTRODUCER),
    [grantIntroducerRow],
  );

  const grantMaintainer = useCallback(
    (userId: number) => grantIntroducerRow(userId, ResourceIntroducerType.MAINTAINER),
    [grantIntroducerRow],
  );

  const revokeIntroducer = useCallback(
    async (userId: number, type: ResourceIntroducerType) => {
      setPendingIntroducer({ userId, type });
      try {
        if (isResource) {
          await revokeResourceIntroducerMut({ resourceId: target.id, userId, requestBody: { type } });
        } else {
          await revokeGroupIntroducerMut({ groupId: target.id, userId, requestBody: { type } });
        }
      } finally {
        setPendingIntroducer(null);
      }
    },
    [revokeResourceIntroducerMut, revokeGroupIntroducerMut, isResource, target.id, setPendingIntroducer],
  );

  const grantIntroduction = useCallback(
    async (userId: number, comment?: string) => {
      setPendingIntroductionUserId(userId);
      try {
        const requestBody = { comment: comment || undefined };
        if (isResource) {
          await grantResourceIntroductionMut({ resourceId: target.id, userId, requestBody });
        } else {
          await grantGroupIntroductionMut({ groupId: target.id, userId, requestBody });
        }
      } finally {
        setPendingIntroductionUserId(null);
      }
    },
    [grantResourceIntroductionMut, grantGroupIntroductionMut, isResource, target.id, setPendingIntroductionUserId],
  );

  const revokeIntroduction = useCallback(
    async (userId: number, comment?: string) => {
      setPendingIntroductionUserId(userId);
      try {
        const requestBody = { comment: comment || undefined };
        if (isResource) {
          await revokeResourceIntroductionMut({ resourceId: target.id, userId, requestBody });
        } else {
          await revokeGroupIntroductionMut({ groupId: target.id, userId, requestBody });
        }
      } finally {
        setPendingIntroductionUserId(null);
      }
    },
    [revokeResourceIntroductionMut, revokeGroupIntroductionMut, isResource, target.id, setPendingIntroductionUserId],
  );

  return {
    grantIntroducer,
    grantMaintainer,
    revokeIntroducer,
    grantIntroduction,
    revokeIntroduction,
    pendingIntroducer,
    pendingIntroductionUserId,
    isGrantingIntroducer,
    isRevokingIntroducer,
    isGrantingIntroduction,
    isRevokingIntroduction,
    isMutating: isGrantingIntroducer || isRevokingIntroducer || isGrantingIntroduction || isRevokingIntroduction,
  };
}
