import { useCallback, useMemo, useState } from 'react';
import {
  ResourceGroup,
  useResourcesServiceGetAllResourcesKey,
  useResourcesServiceGetOneResourceById,
  UseResourcesServiceGetOneResourceByIdKeyFn,
  useResourcesServiceResourceGroupsAddResource,
  useResourcesServiceResourceGroupsGetMany,
  useResourcesServiceResourceGroupsRemoveResource,
} from '@attraccess/react-query-client';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardProps,
  Checkbox,
  Link,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { TableDataLoadingIndicator } from '../../../components/tableComponents';
import { EmptyState } from '../../../components/emptyState';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { GroupIcon, PlusIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../components/pageHeader';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';
import en from './en.json';
import de from './de.json';
import { ResourceGroupUpsertModal } from '../../resource-groups/upsertModal/resourceGroupUpsertModal';

interface ManageResourceGroupsProps {
  resourceId: number;
}

export function ManageResourceGroups({
  resourceId,
  ...cardProps
}: Readonly<ManageResourceGroupsProps & Omit<CardProps, 'children'>>) {
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const { data: groups, status: fetchStatus } = useResourcesServiceResourceGroupsGetMany();

  const loadingState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

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

  const [page, setPage] = useState(1);
  const perPage = 10;
  const totalPages = useMemo(() => {
    return Math.ceil((groupsWithResource?.length ?? 0) / perPage);
  }, [groupsWithResource]);

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

  return (
    <Card {...cardProps}>
      <CardHeader>
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          icon={<GroupIcon />}
          noMargin
          actions={
            <ResourceGroupUpsertModal onUpserted={onGroupCreated}>
              {(onOpen: () => void) => (
                <Button
                  radius="full"
                  onPress={onOpen}
                  startContent={<PlusIcon size={18} />}
                  color="secondary"
                  size="sm"
                  data-cy="toolbar-open-create-resource-group-modal-button"
                >
                  {t('addGroup')}
                </Button>
              )}
            </ResourceGroupUpsertModal>
          }
        />
      </CardHeader>
      <CardBody>
        <Table
          shadow="none"
          removeWrapper
          bottomContent={
            <div className="flex w-full justify-center">
              <Pagination isCompact showControls page={page} total={totalPages} onChange={(page) => setPage(page)} />
            </div>
          }
        >
          <TableHeader>
            <TableColumn>{t('columns.group')}</TableColumn>
            <TableColumn>{t('columns.actions')}</TableColumn>
          </TableHeader>
          <TableBody
            items={currentPage}
            loadingState={loadingState}
            loadingContent={<TableDataLoadingIndicator />}
            emptyContent={<EmptyState />}
          >
            {(group) => (
              <TableRow
                key={group.id}
                className={isAdded(group) ? 'border-l-8 border-l-success' : 'border-l-8 border-l-danger'}
              >
                <TableCell className="w-full">{group.name}</TableCell>
                <TableCell className="text-right flex items-center gap-2">
                  <Checkbox
                    size="lg"
                    onValueChange={() => {
                      handleGroupClick(group);
                    }}
                    color={isAdded(group) ? 'danger' : 'primary'}
                    isSelected={isAdded(group)}
                  />
                  <Link size="lg" href={`/resource-groups/${group.id}`} showAnchorIcon>
                    {t('actions.openGroup')}
                  </Link>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}
