import { HTMLAttributes, useCallback, useState } from 'react';
import { useOverlayState } from '@heroui/react';
import { AlertCircle } from 'lucide-react';
import {
  UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn,
  useAccessControlServiceResourceGroupIntroductionsGetMany,
  useAccessControlServiceResourceGroupIntroductionsGetManyKey,
  useAccessControlServiceResourceGroupIntroductionsGrant,
  useAccessControlServiceResourceGroupIntroductionsRevoke,
  User,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import en from './en.json';
import de from './de.json';
import { ResourceGroupIntroductionHistoryModal } from './history';
import { IntroductionsManagement } from '../../../components/IntroductionsManagement';

interface ResourceGroupIntroductionsManagementProps {
  groupId: number;
}

export function ResourceGroupIntroductionsManagement(
  props: Readonly<ResourceGroupIntroductionsManagementProps & Omit<HTMLAttributes<HTMLElement>, 'children'>>,
) {
  const { groupId, ...rest } = props;
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [userIdForHistoryModal, setUserIdForHistoryModal] = useState<number | null>(null);
  const { isOpen: isHistoryModalOpen, open: onHistoryModalOpen, close: onHistoryModalClose } = useOverlayState();

  const {
    data: introductions,
    isLoading,
    error,
  } = useAccessControlServiceResourceGroupIntroductionsGetMany({
    groupId,
  });

  const { mutateAsync: grantIntroductionMutation, isPending: isGranting } =
    useAccessControlServiceResourceGroupIntroductionsGrant({
      onSuccess: (data) => {
        toast.success({
          title: t('createSuccessTitle'),
          description: t('createSuccessDescription'),
        });
        queryClient.invalidateQueries({
          queryKey: [useAccessControlServiceResourceGroupIntroductionsGetManyKey],
        });
      },
      onError: (err: Error) => {
        toast.error({
          title: t('createErrorTitle'),
          description: t('createErrorDescription', { error: err.message }),
        });
      },
    });

  const grantIntroduction = useCallback(
    async (user: User, comment?: string) => {
      await grantIntroductionMutation({
        groupId,
        userId: user.id,
        requestBody: {
          comment,
        },
      });

      queryClient.invalidateQueries({
        queryKey: [UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn({ groupId, userId: user.id })],
      });
    },
    [grantIntroductionMutation, groupId, queryClient],
  );

  const { mutateAsync: revokeIntroductionMutation, isPending: isRevoking } =
    useAccessControlServiceResourceGroupIntroductionsRevoke({
      onSuccess: () => {
        toast.success({
          title: t('revokeSuccessTitle'),
          description: t('revokeSuccessDescription'),
        });
        queryClient.invalidateQueries({
          queryKey: [useAccessControlServiceResourceGroupIntroductionsGetManyKey],
        });
      },
      onError: (err: Error) => {
        toast.error({
          title: t('revokeErrorTitle'),
          description: t('revokeErrorDescription', { error: err.message }),
        });
      },
    });

  const revokeIntroduction = useCallback(
    async (user: User, comment?: string) => {
      await revokeIntroductionMutation({
        groupId,
        userId: user.id,
        requestBody: {
          comment,
        },
      });

      queryClient.invalidateQueries({
        queryKey: [UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn({ groupId, userId: user.id })],
      });
    },
    [revokeIntroductionMutation, groupId, queryClient],
  );

  if (error) {
    return (
      <div {...rest}>
        <div className="flex items-center gap-3">
          <AlertCircle size={20} color="red" />
          <div>
            <p className="text-danger font-medium">{t('loadError')}</p>
            <p className="text-sm opacity-70">{t('loadErrorDescription')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <IntroductionsManagement
        introductions={introductions ?? []}
        onGrantIntroduction={({ user, comment }) => grantIntroduction(user, comment)}
        onRevokeIntroduction={({ user, comment }) => revokeIntroduction(user, comment)}
        isGranting={isGranting}
        isRevoking={isRevoking}
        isLoadingIntroductions={isLoading}
        onHistoryModalOpen={({ user }) => {
          setUserIdForHistoryModal(user.id);
          onHistoryModalOpen();
        }}
        {...rest}
      />

      <ResourceGroupIntroductionHistoryModal
        groupId={groupId}
        userId={userIdForHistoryModal ?? -1}
        isOpen={isHistoryModalOpen}
        onClose={onHistoryModalClose}
      />
    </>
  );
}
