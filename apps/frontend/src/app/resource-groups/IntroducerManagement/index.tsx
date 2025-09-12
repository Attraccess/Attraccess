import { Card, CardBody, CardProps } from '@heroui/react';
import { AlertCircle } from 'lucide-react';
import {
  useAccessControlServiceResourceGroupIntroducersGetMany,
  useAccessControlServiceResourceGroupIntroducersGrant,
  useAccessControlServiceResourceGroupIntroducersRevoke,
  UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn,
  User,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import en from './en.json';
import de from './de.json';
import { IntroducerManagement } from '../../../components/IntroducerManagement';

interface ResourceGroupIntroducerManagementProps {
  groupId: number;
}

export function ResoureGroupIntroducerManagement(
  props: Readonly<ResourceGroupIntroducerManagementProps & Omit<CardProps, 'children'>>,
) {
  const { groupId, ...cardProps } = props;

  const { t } = useTranslations({ en, de });
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();

  const {
    data: introducersData,
    isLoading,
    error,
  } = useAccessControlServiceResourceGroupIntroducersGetMany({ groupId });

  const { mutate: grantIntroducerMutation, isPending: isGranting } =
    useAccessControlServiceResourceGroupIntroducersGrant({
      onSuccess: () => {
        success({
          title: t('add.successTitle'),
          description: t('add.successDescription'),
        });
        queryClient.invalidateQueries({
          queryKey: UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn({ groupId }),
        });
      },
      onError: (err: Error) => {
        showError({
          title: t('add.errorTitle'),
          description: t('add.errorDescription', { error: err.message }),
        });
      },
    });

  const grantIntroducer = (user: User) => {
    if (user?.id) {
      grantIntroducerMutation({ groupId, userId: user.id });
    }
  };

  const { mutate: revokeIntroducerMutation, isPending: isRevoking } =
    useAccessControlServiceResourceGroupIntroducersRevoke({
      onSuccess: () => {
        success({
          title: t('remove.successTitle'),
          description: t('remove.successDescription'),
        });
        queryClient.invalidateQueries({
          queryKey: UseAccessControlServiceResourceGroupIntroducersGetManyKeyFn({ groupId }),
        });
      },
      onError: (err: Error) => {
        showError({
          title: t('remove.errorTitle'),
          description: t('remove.errorDescription', { error: err.message }),
        });
      },
    });

  const revokeIntroducer = (user: User) => {
    if (user?.id) {
      revokeIntroducerMutation({ groupId, userId: user.id });
    }
  };

  if (error) {
    return (
      <Card {...cardProps}>
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={20} color="red" />
            <div>
              <p style={{ color: 'red', fontWeight: '500' }}>{t('load.error')}</p>
              <p style={{ fontSize: '14px', opacity: 0.7 }}>{t('load.errorDescription')}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <IntroducerManagement
      isLoadingIntroducers={isLoading}
      introducers={introducersData ?? []}
      onGrantIntroducer={grantIntroducer}
      onRevokeIntroducer={revokeIntroducer}
      isGranting={isGranting}
      isRevoking={isRevoking}
      {...cardProps}
    />
  );
}
