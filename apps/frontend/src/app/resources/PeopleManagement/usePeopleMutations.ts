import { useCallback, useState } from 'react';
import {
  UseAccessControlServiceResourceIntroducersGetManyKeyFn,
  UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn,
  UseAccessControlServiceResourceIntroductionsGetManyKeyFn,
  useAccessControlServiceResourceIntroducersGrant,
  useAccessControlServiceResourceIntroducersRevoke,
  useAccessControlServiceResourceIntroductionsGrant,
  useAccessControlServiceResourceIntroductionsRevoke,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';

interface Params {
  resourceId: number;
  t: TFunction;
}

export interface PeopleMutations {
  grantIntroducer: (userId: number) => Promise<void>;
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

export function usePeopleMutations({ resourceId, t }: Params): PeopleMutations {
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [pendingIntroducerUserId, setPendingIntroducerUserId] = useState<number | null>(null);
  const [pendingIntroductionUserId, setPendingIntroductionUserId] = useState<number | null>(null);

  const invalidateIntroducers = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: UseAccessControlServiceResourceIntroducersGetManyKeyFn({ resourceId }),
    });
  }, [queryClient, resourceId]);

  const invalidateIntroductions = useCallback(
    (userId?: number) => {
      queryClient.invalidateQueries({
        queryKey: UseAccessControlServiceResourceIntroductionsGetManyKeyFn({ resourceId }),
      });
      if (userId !== undefined) {
        queryClient.invalidateQueries({
          queryKey: UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId, userId }),
        });
      }
    },
    [queryClient, resourceId],
  );

  const { mutateAsync: grantIntroducerMut, isPending: isGrantingIntroducer } =
    useAccessControlServiceResourceIntroducersGrant({
      onSuccess: () => {
        toast.success({
          title: t('toasts.introducerGranted.title'),
          description: t('toasts.introducerGranted.description'),
        });
        invalidateIntroducers();
      },
      onError: (err: Error) => {
        toast.error({
          title: t('toasts.introducerGrantFailed.title'),
          description: t('toasts.introducerGrantFailed.description', { error: err.message }),
        });
      },
    });

  const { mutateAsync: revokeIntroducerMut, isPending: isRevokingIntroducer } =
    useAccessControlServiceResourceIntroducersRevoke({
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
    });

  const { mutateAsync: grantIntroductionMut, isPending: isGrantingIntroduction } =
    useAccessControlServiceResourceIntroductionsGrant({
      onSuccess: (_data, variables) => {
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
    });

  const { mutateAsync: revokeIntroductionMut, isPending: isRevokingIntroduction } =
    useAccessControlServiceResourceIntroductionsRevoke({
      onSuccess: (_data, variables) => {
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
    });

  const grantIntroducer = useCallback(
    async (userId: number) => {
      setPendingIntroducerUserId(userId);
      try {
        await grantIntroducerMut({ resourceId, userId });
      } finally {
        setPendingIntroducerUserId(null);
      }
    },
    [grantIntroducerMut, resourceId],
  );

  const revokeIntroducer = useCallback(
    async (userId: number) => {
      setPendingIntroducerUserId(userId);
      try {
        await revokeIntroducerMut({ resourceId, userId });
      } finally {
        setPendingIntroducerUserId(null);
      }
    },
    [revokeIntroducerMut, resourceId],
  );

  const grantIntroduction = useCallback(
    async (userId: number, comment?: string) => {
      setPendingIntroductionUserId(userId);
      try {
        await grantIntroductionMut({
          resourceId,
          userId,
          requestBody: { comment: comment || undefined },
        });
      } finally {
        setPendingIntroductionUserId(null);
      }
    },
    [grantIntroductionMut, resourceId],
  );

  const revokeIntroduction = useCallback(
    async (userId: number, comment?: string) => {
      setPendingIntroductionUserId(userId);
      try {
        await revokeIntroductionMut({
          resourceId,
          userId,
          requestBody: { comment: comment || undefined },
        });
      } finally {
        setPendingIntroductionUserId(null);
      }
    },
    [revokeIntroductionMut, resourceId],
  );

  return {
    grantIntroducer,
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
