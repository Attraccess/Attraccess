import {
  useAccessControlServiceResourceGroupIntroducersIsIntroducer,
  useResourcesServiceGetAllResources,
  useResourcesServiceResourceGroupsGetOne,
} from '@attraccess/react-query-client';
import { Button, Card, CardProps, Skeleton, Table, TableBody, TableCell, TableColumn, TableContent, TableHeader, TableRow } from '@heroui/react';
import { EmptyState } from '../../../components/emptyState';
import { PageHeader } from '../../../components/pageHeader';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { filenameToUrl } from '../../../api';
import { StatusChip } from './statusChip';
import { ChevronRightIcon, CogIcon, ShapesIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../hooks/useAuth';
import { useDebounce } from '../../../hooks/useDebounce';
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
  const tableAriaLabel = t('accessibility.tableLabel', { group: accessibleTitle });

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
        <Table>
          <TableContent aria-label={tableAriaLabel}>
          <TableHeader>
            <TableColumn width="0">{t('columns.image')}</TableColumn>
            <TableColumn isRowHeader>{t('columns.name')}</TableColumn>
            <TableColumn width="0" className="text-left">
              {t('columns.status')}
            </TableColumn>
            <TableColumn width="0">{''}</TableColumn>
          </TableHeader>
          <TableBody
            items={resources?.data ?? []}
            renderEmptyState={() => <EmptyState />}
          >
            {(resource) => (
              <TableRow key={resource.id} id={resource.id} className="cursor-pointer hover:bg-primary-50 transition-bg duration-300" onAction={() => navigate(`/resources/${resource.id}`)}>
                <TableCell>
                  {resource.imageFilename ? (
                    <img
                      height={48}
                      width={48}
                      src={filenameToUrl(resource.imageFilename)}
                      alt=""
                      aria-hidden="true"
                      className="object-contain"
                      style={{ height: 48, width: 48 }}
                    />
                  ) : (
                    <div
                      className="flex items-center justify-center text-default-400"
                      style={{ height: 48, width: 48 }}
                      aria-hidden="true"
                    >
                      <ShapesIcon className="w-6 h-6" />
                    </div>
                  )}
                </TableCell>
                <TableCell>{resource.name}</TableCell>
                <TableCell className="text-right">
                  <StatusChip resourceId={resource.id} />
                </TableCell>
                <TableCell>
                  <ChevronRightIcon />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          </TableContent>
        </Table>
      </Card.Content>

      <Card.Footer className="flex w-full justify-center">
        {isFetchedResources && (
          <SimplePagination showControls page={page} total={totalPages} onChange={(page) => setPage(page)} />
        )}
      </Card.Footer>
    </Card>
  );
}
