import { HTMLAttributes } from 'react';
import { GroupIcon } from 'lucide-react';
import { FlatSection } from '../../../components/flatSection';
import { useManageResourceGroupsState } from './useManageResourceGroupsState';

export type ManageResourceGroupsProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  resourceId: number;
  hideHeader?: boolean;
};

export function ManageResourceGroups({ resourceId, hideHeader, ...rest }: Readonly<ManageResourceGroupsProps>) {
  const { t, content } = useManageResourceGroupsState({ resourceId, hideHeader, ...rest });

  if (hideHeader) {
    return <section {...rest}>{content}</section>;
  }

  return (
    <FlatSection icon={<GroupIcon className="w-4 h-4" />} title={t('title')} {...rest}>
      {content}
    </FlatSection>
  );
}
