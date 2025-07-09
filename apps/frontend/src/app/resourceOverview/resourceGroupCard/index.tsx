import {
  useAccessControlServiceResourceGroupIntroducersIsIntroducer,
  useResourcesServiceGetAllResources,
  useResourcesServiceResourceGroupsGetOne,
} from '@attraccess/react-query-client';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardProps,
  Image,
  Link,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { TableDataLoadingIndicator } from '../../../components/tableComponents';
import { EmptyState } from '../../../components/emptyState';
import { PageHeader } from '../../../components/pageHeader';
import { useMemo, useState } from 'react';
import { filenameToUrl } from '../../../api';
import { StatusChip } from './statusChip';
import { ChevronRightIcon, Settings2Icon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../hooks/useAuth';
import { useDebounce } from '../../../hooks/useDebounce';
import { FilterProps } from '../filterProps';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';

import en from './en.json';
import de from './de.json';

interface Props {
  groupId: number | 'none' | 'empty';
  filter?: Pick<FilterProps, 'search' | 'onlyInUseByMe' | 'onlyWithPermissions'>;
}

export function ResourceGroupCard(props: Readonly<Props & Omit<CardProps, 'children'>>) {
  const { groupId, filter, ...cardProps } = props;

  const { t } = useTranslations('resourceGroupCard', { de, en });
  const { hasPermission, user } = useAuth();

  const debouncedSearchValue = useDebounce(filter?.search, 250);
  const perPage = 10;
  const [page, setPage] = useState(1);

  const { data: group, status: fetchStatusGroup } = useResourcesServiceResourceGroupsGetOne(
    { id: groupId as number },
    undefined,
    {
      enabled: typeof groupId === 'number',
    }
  );

  const { data: resources, status: fetchStatus } = useResourcesServiceGetAllResources(
    {
      groupId: groupId === 'none' ? -1 : (groupId as number),
      search: debouncedSearchValue?.trim() || undefined,
      onlyInUseByMe: filter?.onlyInUseByMe,
      onlyWithPermissions: filter?.onlyWithPermissions,
      page,
      limit: perPage,
    },
    undefined,
    {
      enabled: groupId !== 'empty',
    }
  );

  const loadingState = useReactQueryStatusToHeroUiTableLoadingState(groupId === 'empty' ? 'success' : fetchStatus);

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
    }
  );

  const hasAccessToGroupSettings = useMemo(() => {
    return canManageResources || introductionStatus?.isIntroducer;
  }, [introductionStatus, canManageResources]);

  const title = useMemo(() => {
    if (groupId === 'none') {
      return t('ungrouped');
    }

    if (groupId === 'empty') {
      return t('empty.title');
    }

    return group?.name ?? '';
  }, [groupId, group, t]);

  const subtitle = useMemo(() => {
    if (groupId === 'none') {
      return t('ungroupedDescription');
    }

    if (groupId === 'empty') {
      return t('empty.description');
    }

    return group?.description ?? '';
  }, [groupId, group, t]);

  const groupIsFetched = useMemo(() => {
    return groupId === 'none' || fetchStatusGroup === 'success';
  }, [groupId, fetchStatusGroup]);

  if (groupId !== 'empty' && fetchStatus === 'success' && groupIsFetched && resources?.data.length === 0) {
    return null;
  }

  return (
    <Card aria-label={title ?? 'Resource Group Card'} {...cardProps}>
      <CardHeader className="flex flex-row justify-between">
        {groupId === 'empty' || groupIsFetched ? (
          <PageHeader title={title} subtitle={subtitle} noMargin />
        ) : (
          <Skeleton className="w-full h-10" />
        )}

        {groupId !== 'none' && hasAccessToGroupSettings && (
          <Button as={Link} href={`/resource-groups/${groupId}`} isIconOnly startContent={<Settings2Icon />} />
        )}
      </CardHeader>

      <CardBody>
        <Table shadow="none" removeWrapper aria-label={title ?? 'Resource Group Table'}>
          <TableHeader>
            <TableColumn width="48">{t('columns.image')}</TableColumn>
            <TableColumn>{t('columns.name')}</TableColumn>
            <TableColumn width="150" className="text-right">
              {t('columns.status')}
            </TableColumn>
            <TableColumn width="4">{''}</TableColumn>
          </TableHeader>
          <TableBody
            items={resources?.data ?? []}
            loadingState={loadingState}
            loadingContent={<TableDataLoadingIndicator />}
            emptyContent={<EmptyState />}
          >
            {(resource) => (
              <TableRow
                key={resource.id}
                as={Link}
                href={`/resources/${resource.id}`}
                className="cursor-pointer hover:scale-105 hover:shadow-lg transition-all duration-300"
              >
                <TableCell>
                  <Image
                    height={48}
                    width={48}
                    isBlurred
                    src={filenameToUrl(resource.imageFilename)}
                    alt={resource.name}
                    classNames={{
                      img: 'object-contain',
                    }}
                  />
                </TableCell>
                <TableCell>{resource.name}</TableCell>
                <TableCell className="text-right">
                  <StatusChip resourceId={resource.id} />
                </TableCell>
                <TableCell>
                  <Button
                    className="md:inline hidden"
                    as={Link}
                    href={`/resources/${resource.id}`}
                    isIconOnly
                    startContent={<ChevronRightIcon />}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardBody>

      <CardFooter className="flex w-full justify-center">
        <Pagination isCompact showControls page={page} total={totalPages} onChange={(page) => setPage(page)} />
      </CardFooter>
    </Card>
  );
}
