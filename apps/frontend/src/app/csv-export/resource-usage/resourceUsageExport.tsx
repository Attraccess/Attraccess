import {
  ResourceUsage,
  useAnalyticsServiceAnalyticsControllerGetResourceUsageHoursInDateRange,
} from '@attraccess/react-query-client';
import { ExportProps } from '../export-props';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableColumn,
  TableCell,
  ModalBody,
  ModalFooter,
  Button,
  Checkbox,
  Listbox,
  ListboxItem,
} from '@heroui/react';
import { useCallback, useMemo, useState } from 'react';
import {
  ListboxWrapper,
  useDateTimeFormatter,
  useNumberFormatter,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { nanoid } from 'nanoid';
import { RotateCwIcon } from 'lucide-react';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';
import { TableDataLoadingIndicator } from '../../../components/tableComponents';
import { EmptyState } from '../../../components/emptyState';

import de from './de.json';
import en from './en.json';

interface CsvColumn {
  getter: (item: ResourceUsage) => string;
  csvHeader: string;
  groupByUserAndResourceGetter: (items: ResourceUsage[]) => string;
  selectedByDefault: boolean;
}

export function ResourceUsageExport(props: ExportProps) {
  const { t } = useTranslations('csv-export.resourceUsageHours', {
    de,
    en,
  });

  const [groupByUserAndResource, setGroupByUserAndResource] = useState(true);

  const {
    data: resourceUsageExport,
    status: fetchStatus,
    refetch,
  } = useAnalyticsServiceAnalyticsControllerGetResourceUsageHoursInDateRange({
    start: props.start.toISOString(),
    end: props.end.toISOString(),
  });

  const formatDateTimeFull = useDateTimeFormatter({ showDate: true, showTime: true, showSeconds: true });
  const formatUsageDuration = useNumberFormatter();

  const availableCsvColumns = useMemo(() => {
    return [
      {
        csvHeader: 'resourceId',
        getter: (item) => item.resource?.id,
        groupByUserAndResourceGetter: (items) => items[0].resource?.id,
        selectedByDefault: true,
      },
      {
        csvHeader: 'resourceName',
        getter: (item) => item.resource?.name,
        groupByUserAndResourceGetter: (items) => items[0].resource?.name,
        selectedByDefault: true,
      },
      {
        csvHeader: 'userId',
        getter: (item) => item.user?.id,
        groupByUserAndResourceGetter: (items) => items[0].user?.id,
        selectedByDefault: true,
      },
      {
        csvHeader: 'username',
        getter: (item) => item.user?.username,
        groupByUserAndResourceGetter: (items) => items[0].user?.username,
        selectedByDefault: true,
      },
      {
        csvHeader: 'startTimeISO',
        getter: (item) => item.startTime,
        groupByUserAndResourceGetter: (items) => '',
      },
      {
        csvHeader: 'startTime',
        getter: (item) => formatDateTimeFull(item.startTime),
        groupByUserAndResourceGetter: (items) => '',
      },
      {
        csvHeader: 'endTimeISO',
        getter: (item) => item.endTime,
        groupByUserAndResourceGetter: (items) => '',
      },
      {
        csvHeader: 'endTime',
        getter: (item) => formatDateTimeFull(item.endTime),
        groupByUserAndResourceGetter: (items) => '',
      },
      {
        csvHeader: 'usageInMinutes',
        getter: (item) => formatUsageDuration(item.usageInMinutes),
        groupByUserAndResourceGetter: (items) =>
          formatUsageDuration(items.reduce((acc, item) => acc + item.usageInMinutes, 0)),
      },
      {
        csvHeader: 'usageInHours',
        getter: (item) => formatUsageDuration(item.usageInMinutes / 60),
        groupByUserAndResourceGetter: (items) =>
          formatUsageDuration(items.reduce((acc, item) => acc + item.usageInMinutes / 60, 0)),
        selectedByDefault: true,
      },
      {
        csvHeader: 'startNotes',
        getter: (item) => item.startNotes ?? '',
        groupByUserAndResourceGetter: (items) => '',
      },
      {
        csvHeader: 'endNotes',
        getter: (item) => item.endNotes ?? '',
        groupByUserAndResourceGetter: (items) => '',
      },
    ] as Array<CsvColumn>;
  }, [formatUsageDuration, formatDateTimeFull]);

  const [selectedColumnKeys, setSelectedColumnKeys] = useState<Array<string>>(
    availableCsvColumns.filter((col) => col.selectedByDefault).map((col) => col.csvHeader)
  );

  const selectedColumns = useMemo(() => {
    return availableCsvColumns.filter((col) => selectedColumnKeys.includes(col.csvHeader));
  }, [availableCsvColumns, selectedColumnKeys]);

  const csvRowsDefault = useMemo(() => {
    return (resourceUsageExport ?? [])
      .map((item) => {
        return selectedColumns.map((column) => {
          return column.getter(item);
        });
      })
      .map((row) =>
        row.map((cell) => {
          // Escape quotes and wrap in quotes if contains delimiter, quotes or newlines
          const needsQuoting =
            typeof cell === 'string' && (cell.includes(';') || cell.includes('"') || cell.includes('\n'));
          const escaped = String(cell).replace(/"/g, '""');
          return needsQuoting ? `"${escaped}"` : escaped;
        })
      ) as Array<Array<string>>;
  }, [resourceUsageExport, selectedColumns]);

  const csvRowsByUserAndResource = useMemo(() => {
    const groups: Record<string, Record<string, ResourceUsage[]>> = {};

    (resourceUsageExport ?? []).forEach((usage) => {
      const userId = usage.user?.id;
      const resourceId = usage.resource?.id;

      if (!userId || !resourceId) {
        return;
      }

      if (!groups[userId]) {
        groups[userId] = {};
      }

      if (!groups[userId][resourceId]) {
        groups[userId][resourceId] = [];
      }

      groups[userId][resourceId].push(usage);
    });

    const rows: Array<Array<string>> = [];
    Object.values(groups).forEach((userGroup) => {
      Object.values(userGroup).forEach((resourceGroup) => {
        rows.push(selectedColumns.map((column) => column.groupByUserAndResourceGetter(resourceGroup)));
      });
    });

    return rows;
  }, [resourceUsageExport, selectedColumns]);

  const csvRows = useMemo(() => {
    if (groupByUserAndResource) {
      return csvRowsByUserAndResource;
    }

    return csvRowsDefault;
  }, [csvRowsDefault, csvRowsByUserAndResource, groupByUserAndResource]);

  const csvRowsWithId = useMemo(() => {
    return csvRows.map((row, index) => {
      return {
        id: nanoid(),
        row: row.map((col) => ({
          col,
          id: nanoid(),
        })),
      };
    });
  }, [csvRows]);

  const downloadCsv = useCallback(() => {
    const headerRow = selectedColumns.map((column) => column.csvHeader);

    const csv = [headerRow.join(';'), ...csvRows.map((row) => row.join(';'))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resource-usage.csv';
    a.click();
  }, [selectedColumns, csvRows]);

  const loadingState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

  return (
    <>
      <ModalBody>
        <label className="text-sm font-medium">{t('columns.label')}</label>
        <ListboxWrapper>
          <Listbox
            classNames={{
              list: 'max-h-[200px] overflow-scroll',
            }}
            defaultSelectedKeys={selectedColumnKeys}
            items={availableCsvColumns}
            label={t('list.label')}
            selectionMode="multiple"
            variant="flat"
            onSelectionChange={(keys) => {
              setSelectedColumnKeys(Array.from(keys as Set<string>));
            }}
            data-cy="resource-usage-export-columns-listbox"
          >
            {(column) => (
              <ListboxItem key={column.csvHeader} textValue={column.csvHeader}>
                {column.csvHeader}
              </ListboxItem>
            )}
          </Listbox>
        </ListboxWrapper>

        <div className="flex gap-4">
          <Button
            variant="light"
            color="secondary"
            endContent={<RotateCwIcon className={'w-4 h-4 ' + (fetchStatus === 'pending' ? 'animate-spin' : '')} />}
            onPress={() => refetch()}
            data-cy="resource-usage-export-refresh-button"
          >
            {t('refreshData')}
          </Button>
          <Checkbox
            isSelected={groupByUserAndResource}
            onValueChange={setGroupByUserAndResource}
            data-cy="resource-usage-export-grouping-checkbox"
          >
            {t('options.groupByUserAndResource')}
          </Checkbox>
        </div>

        <Table isCompact isVirtualized maxTableHeight={500} rowHeight={40} data-cy="resource-usage-export-table">
          <TableHeader columns={selectedColumns}>
            {(column) => <TableColumn key={column.csvHeader}>{column.csvHeader}</TableColumn>}
          </TableHeader>
          <TableBody
            items={csvRowsWithId}
            loadingState={loadingState}
            loadingContent={<TableDataLoadingIndicator />}
            emptyContent={<EmptyState />}
          >
            {(row) => (
              <TableRow key={row.id}>
                {row.row.map((column) => (
                  <TableCell style={{ whiteSpace: 'nowrap' }} key={`${row.id}.${column.id}`}>
                    {column.col}
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ModalBody>
      <ModalFooter>
        <Button onPress={() => downloadCsv()} data-cy="resource-usage-export-download-csv-button">
          {t('downloadCsv')}
        </Button>
      </ModalFooter>
    </>
  );
}
