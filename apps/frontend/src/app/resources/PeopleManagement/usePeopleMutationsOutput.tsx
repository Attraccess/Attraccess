import { useCallback } from 'react';
import type { usePeopleMutationsRevokeIntroductionToasts } from './usePeopleMutationsRevokeIntroductionToasts';

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
