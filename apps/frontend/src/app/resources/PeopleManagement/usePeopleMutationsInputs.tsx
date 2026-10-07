import { useCallback, useState } from 'react';
import {
  useAccessControlServiceResourceIntroductionsGetPeopleKey,
  UseAccessControlServiceResourceIntroductionsGetPeopleKeyFn,
  UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn,
  UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn,
  UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn,
  UseAccessControlServiceResourceIntroducersGetManyKeyFn,
  UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn,
  UseAccessControlServiceResourceIntroductionsGetManyKeyFn,
} from '@attraccess/react-query-client';
import { ResourceIntroducerType } from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../components/toastProvider';
import { Params } from './usePeopleMutations.contracts';

export function usePeopleMutationsInputs({ target, t }: Params) {
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

  const invalidateIntroductions = useCallback(
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
  return {
    toast,
    queryClient,
    isResource,
    pendingIntroducer,
    setPendingIntroducer,
    pendingIntroductionUserId,
    setPendingIntroductionUserId,
    invalidateIntroducers,
    invalidateIntroductions,
    grantIntroducerToasts,
    revokeIntroducerToasts,
    grantIntroductionToasts,
    target,
    t,
  } as const;
}
