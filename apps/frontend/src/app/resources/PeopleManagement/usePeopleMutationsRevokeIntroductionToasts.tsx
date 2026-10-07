import { useCallback } from 'react';
import {
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
import type { usePeopleMutationsInputs } from './usePeopleMutationsInputs';

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
