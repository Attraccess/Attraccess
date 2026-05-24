import { HTMLAttributes, useCallback, useMemo, useState } from 'react';
import {
  ResourceGroup,
  useResourcesServiceGetAllResourcesKey,
  useResourcesServiceGetOneResourceById,
  UseResourcesServiceGetOneResourceByIdKeyFn,
  useResourcesServiceResourceGroupsAddResource,
  useResourcesServiceResourceGroupsGetMany,
  useResourcesServiceResourceGroupsRemoveResource,
} from '@attraccess/react-query-client';
import { Button, Checkbox, Link, Table, TableBody, TableCell, TableColumn, TableContent, TableHeader, TableRow } from '@heroui/react';
import { EmptyState } from '../../../components/emptyState';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { GroupIcon, PlusIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import en from './en.json';
import de from './de.json';
import { ResourceGroupUpsertModal } from '../../resource-groups/upsertModal/resourceGroupUpsertModal';
import { FlatSection } from '../../../components/flatSection';

type ManageResourceGroupsProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  resourceId: number;
  hideHeader?: boolean;
};

export function ManageResourceGroups({
  resourceId,
  hideHeader,
  ...rest
}: Readonly<ManageResourceGroupsProps>) {
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const { data: groups } = useResourcesServiceResourceGroupsGetMany();

  const { mutateAsync: addResourceToGroup } = useResourcesServiceResourceGroupsAddResource();

  const { mutateAsync: removeResourceFromGroup } = useResourcesServiceResourceGroupsRemoveResource({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseResourcesServiceGetOneResourceByIdKeyFn({ id: resourceId }) });
    },
  });

  const isAdded = useCallback(
    (group: ResourceGroup) => {
      return resource?.groups.some((g) => g.id === group.id);
    },
    [resource?.groups],
  );

  const handleGroupClick = useCallback(
    async (group: ResourceGroup) => {
      if (!isAdded(group)) {
        await addResourceToGroup({
          groupId: group.id,
          resourceId,
        });
      } else {
        await removeResourceFromGroup({
          groupId: group.id,
          resourceId,
        });
      }

      queryClient.invalidateQueries({
        queryKey: [useResourcesServiceGetAllResourcesKey],
      });
      queryClient.invalidateQueries({ queryKey: UseResourcesServiceGetOneResourceByIdKeyFn({ id: resourceId }) });
    },
    [addResourceToGroup, removeResourceFromGroup, resourceId, isAdded, queryClient],
  );

  const groupsWithResource = useMemo(() => {
    if (!groups) {
      return [];
    }

    return groups
      .map((group) => ({
        ...group,
        resource: isAdded(group) ? resource : null,
      }))
      .sort((a, b) => {
        if ((a.resource && b.resource) || (!a.resource && !b.resource)) {
          return a.name.localeCompare(b.name);
        }

        return a.resource ? -1 : 1;
      });
  }, [groups, resource, isAdded]);

  const [page] = useState(1);
  const perPage = 10;

  const currentPage = useMemo(() => {
    if (!groupsWithResource) {
      return [];
    }

    return groupsWithResource.slice((page - 1) * perPage, page * perPage);
  }, [groupsWithResource, page]);

  const onGroupCreated = useCallback(
    (group: ResourceGroup) => {
      handleGroupClick(group);
    },
    [handleGroupClick],
  );

  const actions = (
    <ResourceGroupUpsertModal onUpserted={onGroupCreated}>
      {(onOpen: () => void) => (
        <Button
          variant="primary"
          size="sm"
          onPress={onOpen}
          data-cy="toolbar-open-create-resource-group-modal-button"
        >
          <PlusIcon size={16} />
          {t('addGroup')}
        </Button>
      )}
    </ResourceGroupUpsertModal>
  );

  const tableBody =
    currentPage.length === 0 ? (
      <EmptyState />
    ) : (
      <Table>
        <TableContent aria-label={t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn isRowHeader>{t('columns.group')}</TableColumn>
            <TableColumn>{t('columns.actions')}</TableColumn>
          </TableHeader>
          <TableBody items={currentPage}>
            {(group) => (
              <TableRow
                key={group.id}
                id={group.id}
                className={isAdded(group) ? 'border-l-8 border-l-success' : 'border-l-8 border-l-danger'}
              >
                <TableCell className="w-full">{group.name}</TableCell>
                <TableCell className="text-right flex items-center gap-2">
                  <Checkbox
                    onChange={() => {
                      handleGroupClick(group);
                    }}
                    aria-label={group.name}
                    isSelected={isAdded(group)}
                  />
                  <Link href={`/resource-groups/${group.id}`}>{t('actions.openGroup')}</Link>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </Table>
    );

  if (hideHeader) {
    return (
      <section {...rest}>
        <div className="flex justify-end mb-4">{actions}</div>
        {tableBody}
      </section>
    );
  }

  return (
    <FlatSection icon={<GroupIcon className="w-4 h-4" />} title={t('title')} actions={actions} {...rest}>
      {tableBody}
    </FlatSection>
  );
}
