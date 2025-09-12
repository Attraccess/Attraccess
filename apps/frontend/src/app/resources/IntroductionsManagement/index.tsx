import { useCallback, useState } from 'react';
import { Card, CardBody, CardProps, useDisclosure } from '@heroui/react';
import { AlertCircle } from 'lucide-react';
import {
  UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn,
  useAccessControlServiceResourceIntroductionsGetMany,
  useAccessControlServiceResourceIntroductionsGetManyKey,
  useAccessControlServiceResourceIntroductionsGrant,
  useAccessControlServiceResourceIntroductionsRevoke,
  User,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import en from './en.json';
import de from './de.json';
import { ResourceIntroductionHistoryModal } from './history';
import { IntroductionsManagement } from '../../../components/IntroductionsManagement';

interface ResourceIntroductionsManagementProps {
  resourceId: number;
}

export function ResourceIntroductionsManagement(
  props: Readonly<ResourceIntroductionsManagementProps & Omit<CardProps, 'children'>>,
) {
  const { resourceId, ...rest } = props;
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [userIdForHistoryModal, setUserIdForHistoryModal] = useState<number | null>(null);
  const { isOpen: isHistoryModalOpen, onOpen: onHistoryModalOpen, onClose: onHistoryModalClose } = useDisclosure();

  const {
    data: introductions,
    isLoading,
    error,
  } = useAccessControlServiceResourceIntroductionsGetMany({
    resourceId,
  });

  const { mutateAsync: grantIntroductionMutation, isPending: isGranting } =
    useAccessControlServiceResourceIntroductionsGrant({
      onSuccess: (data) => {
        toast.success({
          title: t('createSuccessTitle'),
          description: t('createSuccessDescription'),
        });
        queryClient.invalidateQueries({
          queryKey: [useAccessControlServiceResourceIntroductionsGetManyKey],
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
        resourceId,
        userId: user.id,
        requestBody: {
          comment,
        },
      });

      queryClient.invalidateQueries({
        queryKey: [UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId, userId: user.id })],
      });
    },
    [grantIntroductionMutation, resourceId, queryClient],
  );

  const { mutateAsync: revokeIntroductionMutation, isPending: isRevoking } =
    useAccessControlServiceResourceIntroductionsRevoke({
      onSuccess: () => {
        toast.success({
          title: t('revokeSuccessTitle'),
          description: t('revokeSuccessDescription'),
        });
        queryClient.invalidateQueries({
          queryKey: [useAccessControlServiceResourceIntroductionsGetManyKey],
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
        resourceId,
        userId: user.id,
        requestBody: {
          comment,
        },
      });

      queryClient.invalidateQueries({
        queryKey: [UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId, userId: user.id })],
      });
    },
    [revokeIntroductionMutation, resourceId, queryClient],
  );

  if (error) {
    return (
      <Card {...rest}>
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={20} color="red" />
            <div>
              <p style={{ color: 'red', fontWeight: '500' }}>{t('loadError')}</p>
              <p style={{ fontSize: '14px', opacity: 0.7 }}>{t('loadErrorDescription')}</p>
            </div>
          </div>
        </CardBody>
      </Card>
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

      <ResourceIntroductionHistoryModal
        resourceId={resourceId}
        userId={userIdForHistoryModal ?? -1}
        isOpen={isHistoryModalOpen}
        onClose={onHistoryModalClose}
      />
    </>
  );
}
