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

export function usePeopleMutationsRevokeIntroductionToasts(model: ReturnType<typeof usePeopleMutationsInputs>) {
  const { setPendingIntroducer, isResource, target, setPendingIntroductionUserId } = model;
  const revokeIntroductionToasts = {
    onSuccess: (_data: unknown, variables: { userId: number }) => {
      model.toast.success({
        title: model.t('toasts.introductionRevoked.title'),
        description: model.t('toasts.introductionRevoked.description'),
      });
      model.invalidateIntroductions(variables.userId);
    },
    onError: (err: Error) => {
      model.toast.error({
        title: model.t('toasts.introductionRevokeFailed.title'),
        description: model.t('toasts.introductionRevokeFailed.description', { error: err.message }),
      });
    },
  };

  const { mutateAsync: grantResourceIntroducerMut, isPending: isGrantingResourceIntroducer } =
    useAccessControlServiceResourceIntroducersGrant(model.grantIntroducerToasts);
  const { mutateAsync: revokeResourceIntroducerMut, isPending: isRevokingResourceIntroducer } =
    useAccessControlServiceResourceIntroducersRevoke(model.revokeIntroducerToasts);
  const { mutateAsync: grantResourceIntroductionMut, isPending: isGrantingResourceIntroduction } =
    useAccessControlServiceResourceIntroductionsGrant(model.grantIntroductionToasts);
  const { mutateAsync: revokeResourceIntroductionMut, isPending: isRevokingResourceIntroduction } =
    useAccessControlServiceResourceIntroductionsRevoke(revokeIntroductionToasts);

  const { mutateAsync: grantGroupIntroducerMut, isPending: isGrantingGroupIntroducer } =
    useAccessControlServiceResourceGroupIntroducersGrant(model.grantIntroducerToasts);
  const { mutateAsync: revokeGroupIntroducerMut, isPending: isRevokingGroupIntroducer } =
    useAccessControlServiceResourceGroupIntroducersRevoke(model.revokeIntroducerToasts);
  const { mutateAsync: grantGroupIntroductionMut, isPending: isGrantingGroupIntroduction } =
    useAccessControlServiceResourceGroupIntroductionsGrant(model.grantIntroductionToasts);
  const { mutateAsync: revokeGroupIntroductionMut, isPending: isRevokingGroupIntroduction } =
    useAccessControlServiceResourceGroupIntroductionsRevoke(revokeIntroductionToasts);

  const isGrantingIntroducer = model.isResource ? isGrantingResourceIntroducer : isGrantingGroupIntroducer;
  const isRevokingIntroducer = model.isResource ? isRevokingResourceIntroducer : isRevokingGroupIntroducer;
  const isGrantingIntroduction = model.isResource ? isGrantingResourceIntroduction : isGrantingGroupIntroduction;
  const isRevokingIntroduction = model.isResource ? isRevokingResourceIntroduction : isRevokingGroupIntroduction;

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
  return {
    ...model,
    revokeIntroductionToasts,
    grantResourceIntroducerMut,
    isGrantingResourceIntroducer,
    revokeResourceIntroducerMut,
    isRevokingResourceIntroducer,
    grantResourceIntroductionMut,
    isGrantingResourceIntroduction,
    revokeResourceIntroductionMut,
    isRevokingResourceIntroduction,
    grantGroupIntroducerMut,
    isGrantingGroupIntroducer,
    revokeGroupIntroducerMut,
    isRevokingGroupIntroducer,
    grantGroupIntroductionMut,
    isGrantingGroupIntroduction,
    revokeGroupIntroductionMut,
    isRevokingGroupIntroduction,
    isGrantingIntroducer,
    isRevokingIntroducer,
    isGrantingIntroduction,
    isRevokingIntroduction,
    grantIntroducerRow,
    grantIntroducer,
    grantMaintainer,
    revokeIntroducer,
    grantIntroduction,
  } as const;
}

export function usePeopleMutationsOutput(model: ReturnType<typeof usePeopleMutationsRevokeIntroductionToasts>) {
  const {
    setPendingIntroductionUserId,
    isResource,
    revokeResourceIntroductionMut,
    target,
    revokeGroupIntroductionMut,
  } = model;
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
    grantIntroducer: model.grantIntroducer,
    grantMaintainer: model.grantMaintainer,
    revokeIntroducer: model.revokeIntroducer,
    grantIntroduction: model.grantIntroduction,
    revokeIntroduction,
    pendingIntroducer: model.pendingIntroducer,
    pendingIntroductionUserId: model.pendingIntroductionUserId,
    isGrantingIntroducer: model.isGrantingIntroducer,
    isRevokingIntroducer: model.isRevokingIntroducer,
    isGrantingIntroduction: model.isGrantingIntroduction,
    isRevokingIntroduction: model.isRevokingIntroduction,
    isMutating:
      model.isGrantingIntroducer ||
      model.isRevokingIntroducer ||
      model.isGrantingIntroduction ||
      model.isRevokingIntroduction,
  };
}

export function usePeopleMutations({ target, t }: Params): PeopleMutations {
  const usePeopleMutationsInputsModel = usePeopleMutationsInputs({ target, t });
  const usePeopleMutationsRevokeIntroductionToastsModel =
    usePeopleMutationsRevokeIntroductionToasts(usePeopleMutationsInputsModel);
  return usePeopleMutationsOutput(usePeopleMutationsRevokeIntroductionToastsModel);
}
