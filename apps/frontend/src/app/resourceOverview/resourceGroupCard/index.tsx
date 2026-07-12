import {
  useAccessControlServiceResourceGroupIntroducersIsIntroducer,
  useResourcesServiceGetAllResources,
  useResourcesServiceResourceGroupsGetOne,
} from '@attraccess/react-query-client';
import { Button, Card, CardProps, Skeleton } from '@heroui/react';
import { EmptyState } from '../../../components/emptyState';
import { PageHeader } from '../../../components/pageHeader';
import { ResourceListItem } from '../../../components/ResourceListItem';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CogIcon } from 'lucide-react';
import { useDebounce, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../hooks/useAuth';
import { FilterProps } from '../filterProps';

import en from './en.json';
import de from './de.json';
import { SimplePagination } from '../../../components/simplePagination';

interface Props {
  groupId: number | 'none';
  filter?: Pick<FilterProps, 'search' | 'onlyInUseByMe' | 'onlyWithPermissions'>;
  hideIfEmpty: boolean;
}

export function ResourceGroupCard(props: Readonly<Props & Omit<CardProps, 'children'>>) {
  const { groupId, filter, hideIfEmpty, ...cardProps } = props;

  const { t } = useTranslations({ de, en });
  const { hasPermission, user } = useAuth();

  const debouncedSearchValue = useDebounce(filter?.search, 250);
  const perPage = 10;
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data: group, status: fetchStatusGroup } = useResourcesServiceResourceGroupsGetOne(
    { id: groupId as number },
    undefined,
    {
      enabled: typeof groupId === 'number',
    },
  );

  const {
    data: resources,
    status: fetchStatus,
    isFetched: isFetchedResources,
  } = useResourcesServiceGetAllResources({
    groupId: groupId === 'none' ? -1 : (groupId as number),
    search: debouncedSearchValue?.trim() || undefined,
    onlyInUseByMe: filter?.onlyInUseByMe,
    onlyWithPermissions: filter?.onlyWithPermissions,
    page,
    limit: perPage,
  });

  const totalPages = useMemo(() => {
    if (!resources?.total) {
      return 1;
    }

    return Math.ceil(resources.total / perPage);
  }, [resources, perPage]);

  const canManageResources = hasPermission('canManageResources');

  const { data: introductionStatus } = useAccessControlServiceResourceGroupIntroducersIsIntroducer(
    {
      groupId: groupId as number,
      userId: user?.id as number,
    },
    undefined,
    {
      enabled: !!groupId && !!user?.id && groupId !== 'none',
    },
  );

  const hasAccessToGroupSettings = useMemo(() => {
    return canManageResources || introductionStatus?.isIntroducer;
  }, [introductionStatus, canManageResources]);

  const title = useMemo(() => {
    if (groupId === 'none') {
      return t('ungrouped');
    }

    const trimmed = group?.name?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : '';
  }, [groupId, group, t]);

  const subtitle = useMemo(() => {
    if (groupId === 'none') {
      return t('ungroupedDescription');
    }

    const trimmed = group?.description?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : '';
  }, [groupId, group, t]);

  const accessibleTitle = title?.trim() ? title : t('accessibility.unknownGroup');

  const groupIsFetched = useMemo(() => {
    return groupId === 'none' || fetchStatusGroup === 'success';
  }, [groupId, fetchStatusGroup]);

  if (hideIfEmpty && fetchStatus === 'success' && groupIsFetched && resources?.data.length === 0) {
    return null;
  }

  return (
    <Card aria-label={accessibleTitle} {...cardProps}>
      <Card.Header className="flex flex-row justify-between">
        {groupIsFetched ? (
          <PageHeader title={title} subtitle={subtitle} noMargin />
        ) : (
          <Skeleton className="w-full h-10" />
        )}

        {groupId !== 'none' && hasAccessToGroupSettings && (
          <Button
            onPress={() => navigate(`/resource-groups/${groupId}`)}
            isIconOnly
            aria-label={t('actions.openGroupSettings')}
          >
            <CogIcon />
          </Button>
        )}
      </Card.Header>

      <Card.Content>
        {resources?.data.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {(resources?.data ?? []).map((resource) => (
              <ResourceListItem
                key={resource.id}
                resource={resource}
                onPress={() => navigate(`/resources/${resource.id}`)}
              />
            ))}
          </div>
        )}
      </Card.Content>

      <Card.Footer className="flex w-full justify-center">
        {isFetchedResources && (
          <SimplePagination showControls page={page} total={totalPages} onChange={(page) => setPage(page)} />
        )}
      </Card.Footer>
    </Card>
  );
}
