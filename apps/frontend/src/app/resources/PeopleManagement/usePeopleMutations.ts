import { useCallback, useState } from 'react';
import {
  UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn,
  UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn,
  UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn,
  UseAccessControlServiceResourceIntroducersGetManyKeyFn,
  UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn,
  UseAccessControlServiceResourceIntroductionsGetManyKeyFn,
  useAccessControlServiceResourceGroupIntroducersGrant,
  useAccessControlServiceResourceGroupIntroducersRevoke,
  useAccessControlServiceResourceGroupIntroductionsGrant,
  useAccessControlServiceResourceGroupIntroductionsRevoke,
  useAccessControlServiceResourceIntroducersGrant,
  useAccessControlServiceResourceIntroducersRevoke,
  useAccessControlServiceResourceIntroductionsGrant,
  useAccessControlServiceResourceIntroductionsRevoke,
} from '@attraccess/react-query-client';
import { ResourceIntroducerType } from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { PeopleTarget } from './types';

interface Params {
  target: PeopleTarget;
  t: TFunction;
}

export interface PeopleMutations {
  grantIntroducer: (userId: number) => Promise<void>;
  grantMaintainer: (userId: number) => Promise<void>;
  revokeIntroducer: (userId: number) => Promise<void>;
  grantIntroduction: (userId: number, comment?: string) => Promise<void>;
  revokeIntroduction: (userId: number, comment?: string) => Promise<void>;
  pendingIntroducerUserId: number | null;
  pendingIntroductionUserId: number | null;
  isGrantingIntroducer: boolean;
  isRevokingIntroducer: boolean;
  isGrantingIntroduction: boolean;
  isRevokingIntroduction: boolean;
  isMutating: boolean;
}

export function usePeopleMutations({ target, t }: Params): PeopleMutations {
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const isResource = target.type === 'resource';

  const [pendingIntroducerUserId, setPendingIntroducerUserId] = useState<number | null>(null);
  const [pendingIntroductionUserId, setPendingIntroductionUserId] = useState<number | null>(null);

  const invalidateIntroducers = useCallback(() => {
    const queryKey = isResource
      ? UseAccessControlServiceResourceIntroducersGetManyKeyFn({ resourceId: target.id })
      : UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn({ groupId: target.id });
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, target.id, isResource]);

  const invalidateIntroductions = useCallback(
    (userId?: number) => {
      const listKey = isResource
        ? UseAccessControlServiceResourceIntroductionsGetManyKeyFn({ resourceId: target.id })
        : UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn({ groupId: target.id });
      queryClient.invalidateQueries({ queryKey: listKey });
      if (userId !== undefined) {
        const historyKey = isResource
          ? UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId: target.id, userId })
          : UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn({ groupId: target.id, userId });
        queryClient.invalidateQueries({ queryKey: historyKey });
      }
    },
    [queryClient, target.id, isResource],
  );

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
    onSuccess: () => {
      toast.success({
        title: t('toasts.introducerRevoked.title'),
        description: t('toasts.introducerRevoked.description'),
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
      setPendingIntroducerUserId(userId);
      try {
        if (isResource) {
          await grantResourceIntroducerMut({ resourceId: target.id, userId, requestBody: { type } });
        } else {
          await grantGroupIntroducerMut({ groupId: target.id, userId, requestBody: { type } });
        }
      } finally {
        setPendingIntroducerUserId(null);
      }
    },
    [grantResourceIntroducerMut, grantGroupIntroducerMut, isResource, target.id],
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
    async (userId: number) => {
      setPendingIntroducerUserId(userId);
      try {
        if (isResource) {
          await revokeResourceIntroducerMut({ resourceId: target.id, userId });
        } else {
          await revokeGroupIntroducerMut({ groupId: target.id, userId });
        }
      } finally {
        setPendingIntroducerUserId(null);
      }
    },
    [revokeResourceIntroducerMut, revokeGroupIntroducerMut, isResource, target.id],
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
    [grantResourceIntroductionMut, grantGroupIntroductionMut, isResource, target.id],
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
    [revokeResourceIntroductionMut, revokeGroupIntroductionMut, isResource, target.id],
  );

  return {
    grantIntroducer,
    grantMaintainer,
    revokeIntroducer,
    grantIntroduction,
    revokeIntroduction,
    pendingIntroducerUserId,
    pendingIntroductionUserId,
    isGrantingIntroducer,
    isRevokingIntroducer,
    isGrantingIntroduction,
    isRevokingIntroduction,
    isMutating: isGrantingIntroducer || isRevokingIntroducer || isGrantingIntroduction || isRevokingIntroduction,
  };
}
