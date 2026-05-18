import { HTMLAttributes, useMemo } from 'react';
import { Trash2Icon, AwardIcon } from 'lucide-react';
import { User, ResourceIntroducer } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { UserSelectionList } from '../userSelectionList';
import en from './en.json';
import de from './de.json';

interface IntroducerManagementProps {
  isLoadingIntroducers: boolean;
  introducers: ResourceIntroducer[];
  onGrantIntroducer: (user: User) => void;
  onRevokeIntroducer: (user: User) => void;
  isGranting: boolean;
  isRevoking: boolean;
}

export function IntroducerManagement(
  props: Readonly<IntroducerManagementProps & Omit<HTMLAttributes<HTMLElement>, 'children'>>,
) {
  const {
    isLoadingIntroducers,
    introducers,
    onGrantIntroducer,
    onRevokeIntroducer,
    isGranting,
    isRevoking,
    className,
    ...rest
  } = props;

  const { t } = useTranslations({ en, de });

  const introducerUsers = useMemo(() => {
    return introducers?.map((introducer) => introducer.user);
  }, [introducers]);

  return (
    <section className={`w-full flex flex-col gap-4 ${className ?? ''}`} {...rest}>
      <div className="flex items-center gap-2">
        <AwardIcon className="w-4 h-4 text-default-700" />
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('title')}</h3>
      </div>
      <p className="text-sm text-default-500">{t('subtitle')}</p>

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
    </section>
  );
}
