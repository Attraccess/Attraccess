import { useMemo } from 'react';
import { Card, CardProps } from '@heroui/react';
import { Trash2Icon, AwardIcon } from 'lucide-react';
import { User, ResourceIntroducer } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { UserSelectionList } from '../userSelectionList';
import en from './en.json';
import de from './de.json';
import { PageHeader } from '../pageHeader';

interface IntroducerManagementProps {
  isLoadingIntroducers: boolean;
  introducers: ResourceIntroducer[];
  onGrantIntroducer: (user: User) => void;
  onRevokeIntroducer: (user: User) => void;
  isGranting: boolean;
  isRevoking: boolean;
}

export function IntroducerManagement(props: Readonly<IntroducerManagementProps & Omit<CardProps, 'children'>>) {
  const { isLoadingIntroducers, introducers, onGrantIntroducer, onRevokeIntroducer, isGranting, isRevoking, ...rest } =
    props;

  const { t } = useTranslations({ en, de });

  const introducerUsers = useMemo(() => {
    return introducers?.map((introducer) => introducer.user);
  }, [introducers]);

  return (
    <Card {...rest}>
      <Card.Header>
        <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<AwardIcon />} noMargin={true} />
      </Card.Header>
      <Card.Content>
        <UserSelectionList
          selectedUsers={introducerUsers ?? []}
          onAddToSelection={onGrantIntroducer}
          addToSelectionIsLoading={isGranting}
          selectedUserIsLoading={isLoadingIntroducers}
          tableProps={{}}
          actions={[
            {
              key: 'revoke',
              isIconOnly: true,
              isPending: isRevoking,
              startContent: <Trash2Icon className="w-4 h-4" />,
              onClick: (userToRevoke) => {
                onRevokeIntroducer(userToRevoke);
              },
            },
          ]}
        />
      </Card.Content>
    </Card>
  );
}
