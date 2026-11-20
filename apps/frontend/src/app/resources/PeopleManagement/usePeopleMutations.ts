import { useCallback, useState } from 'react';
import {
  useResourceGroupIntroducersGrant,
  useResourceGroupIntroducersRevoke,
  useResourceGroupIntroductionsGrant,
  useResourceGroupIntroductionsRevoke,
  useResourceIntroducersGrant,
  useResourceIntroducersRevoke,
  useResourceIntroductionsGrant,
  useResourceIntroductionsRevoke,
  ResourceIntroducerType,
  UseResourceGroupIntroducersGetManyKeyFn,
  UseResourceIntroducersGetManyKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../components/toastProvider';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PeopleTarget } from './types';
import { useInvalidatePeopleIntroductions } from './useInvalidatePeopleIntroductions';
import en from './en.json';
import de from './de.json';

export interface Params {
  target: PeopleTarget;
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

/** Grant and revoke introducers, maintainers and introductions for a resource or resource group, with toasts. */
export function usePeopleMutations({ target }: Params): PeopleMutations {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const isResource = target.type === 'resource';

  const [pendingIntroducer, setPendingIntroducer] = useState<{ userId: number; type: ResourceIntroducerType } | null>(
    null,
  );
  const [pendingIntroductionUserId, setPendingIntroductionUserId] = useState<number | null>(null);

  const invalidateIntroducers = useCallback(() => {
    const queryKey = isResource
      ? UseResourceIntroducersGetManyKeyFn({ path: { resourceId: target.id } })
      : UseResourceGroupIntroducersGetManyKeyFn({ path: { groupId: target.id } });
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, target.id, isResource]);

  const invalidateIntroductions = useInvalidatePeopleIntroductions(target);

  const grantIntroducerToasts = {
    onSuccess: (_data: unknown, variables: { body?: { type?: ResourceIntroducerType } }) => {
      const isMaintainer = variables?.body?.type === ResourceIntroducerType.MAINTAINER;
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
    onSuccess: (_data: unknown, variables: { body?: { type?: ResourceIntroducerType } }) => {
      const isMaintainer = variables?.body?.type === ResourceIntroducerType.MAINTAINER;
      toast.success({
        title: isMaintainer ? t('toasts.maintainerRevoked.title') : t('toasts.introducerRevoked.title'),
        description: isMaintainer
          ? t('toasts.maintainerRevoked.description')
          : t('toasts.introducerRevoked.description'),
      });
      invalidateIntroducers();
    },
    onError: (err: Error, variables: { body?: { type?: ResourceIntroducerType } }) => {
      const key =
        variables?.body?.type === ResourceIntroducerType.MAINTAINER
          ? 'toasts.maintainerRevokeFailed'
          : 'toasts.introducerRevokeFailed';
      toast.error({ title: t(`${key}.title`), description: t(`${key}.description`, { error: err.message }) });
    },
  };

  const grantIntroductionToasts = {
    onSuccess: (_data: unknown, variables: { path: { userId: number } }) => {
      toast.success({
        title: t('toasts.introductionGranted.title'),
        description: t('toasts.introductionGranted.description'),
      });
      invalidateIntroductions(variables.path.userId);
    },
    onError: (err: Error) => {
      toast.error({
        title: t('toasts.introductionGrantFailed.title'),
        description: t('toasts.introductionGrantFailed.description', { error: err.message }),
      });
    },
  };

  const revokeIntroductionToasts = {
    onSuccess: (_data: unknown, variables: { path: { userId: number } }) => {
      toast.success({
        title: t('toasts.introductionRevoked.title'),
        description: t('toasts.introductionRevoked.description'),
      });
      invalidateIntroductions(variables.path.userId);
    },
    onError: (err: Error) => {
      toast.error({
        title: t('toasts.introductionRevokeFailed.title'),
        description: t('toasts.introductionRevokeFailed.description', { error: err.message }),
      });
    },
  };

  const { mutateAsync: grantResourceIntroducerMut, isPending: isGrantingResourceIntroducer } =
    useResourceIntroducersGrant(undefined, grantIntroducerToasts);
  const { mutateAsync: revokeResourceIntroducerMut, isPending: isRevokingResourceIntroducer } =
    useResourceIntroducersRevoke(undefined, revokeIntroducerToasts);
  const { mutateAsync: grantResourceIntroductionMut, isPending: isGrantingResourceIntroduction } =
    useResourceIntroductionsGrant(undefined, grantIntroductionToasts);
  const { mutateAsync: revokeResourceIntroductionMut, isPending: isRevokingResourceIntroduction } =
    useResourceIntroductionsRevoke(undefined, revokeIntroductionToasts);

  const { mutateAsync: grantGroupIntroducerMut, isPending: isGrantingGroupIntroducer } =
    useResourceGroupIntroducersGrant(undefined, grantIntroducerToasts);
  const { mutateAsync: revokeGroupIntroducerMut, isPending: isRevokingGroupIntroducer } =
    useResourceGroupIntroducersRevoke(undefined, revokeIntroducerToasts);
  const { mutateAsync: grantGroupIntroductionMut, isPending: isGrantingGroupIntroduction } =
    useResourceGroupIntroductionsGrant(undefined, grantIntroductionToasts);
  const { mutateAsync: revokeGroupIntroductionMut, isPending: isRevokingGroupIntroduction } =
    useResourceGroupIntroductionsRevoke(undefined, revokeIntroductionToasts);

  const isGrantingIntroducer = isResource ? isGrantingResourceIntroducer : isGrantingGroupIntroducer;
  const isRevokingIntroducer = isResource ? isRevokingResourceIntroducer : isRevokingGroupIntroducer;
  const isGrantingIntroduction = isResource ? isGrantingResourceIntroduction : isGrantingGroupIntroduction;
  const isRevokingIntroduction = isResource ? isRevokingResourceIntroduction : isRevokingGroupIntroduction;

  const grantIntroducerRow = useCallback(
    async (userId: number, type: ResourceIntroducerType) => {
      setPendingIntroducer({ userId, type });
      try {
        if (isResource) {
          await grantResourceIntroducerMut({ path: { resourceId: target.id, userId }, body: { type } });
        } else {
          await grantGroupIntroducerMut({ path: { groupId: target.id, userId }, body: { type } });
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
          await revokeResourceIntroducerMut({ path: { resourceId: target.id, userId }, body: { type } });
        } else {
          await revokeGroupIntroducerMut({ path: { groupId: target.id, userId }, body: { type } });
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
          await grantResourceIntroductionMut({ path: { resourceId: target.id, userId }, body: requestBody });
        } else {
          await grantGroupIntroductionMut({ path: { groupId: target.id, userId }, body: requestBody });
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
          await revokeResourceIntroductionMut({ path: { resourceId: target.id, userId }, body: requestBody });
        } else {
          await revokeGroupIntroductionMut({ path: { groupId: target.id, userId }, body: requestBody });
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
