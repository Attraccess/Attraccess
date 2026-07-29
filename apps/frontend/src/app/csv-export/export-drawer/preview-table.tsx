// Preview table for CSV export drawer — first N rows with selected columns
// FEATURE: CSV export — data sample shown before download
import {
  Button,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { QueryStatus } from '@tanstack/react-query';
import { RotateCwIcon } from 'lucide-react';
import { EmptyState } from '../../../components/emptyState';

interface PreviewColumn {
  key: string;
  label: string;
}

interface PreviewRow {
  key: string;
  columns: Array<{ key: string; value: string }>;
}

interface Props {
  columns: PreviewColumn[];
  rows: PreviewRow[];
  totalCount: number;
  previewLimit: number;
  ariaLabel: string;
  titleLabel: (vars: { n: number }) => string;
  rowCountLabel: (vars: { count: number }) => string;
  refetch?: () => unknown;
  queryStatus: QueryStatus;
}

export function PreviewTable(props: Props) {
  const { columns, rows, totalCount, previewLimit, ariaLabel, titleLabel, rowCountLabel, refetch, queryStatus } = props;

  const limited = rows.slice(0, previewLimit);

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{titleLabel({ n: previewLimit })}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{rowCountLabel({ count: totalCount })}</span>
          {refetch && (
            <Button
              size="sm"
              variant="outline"
              isIconOnly
              onPress={() => refetch()}
              data-cy="resource-usage-export-refresh-button"
              aria-label="refresh"
            >
              <RotateCwIcon className={'size-4 ' + (queryStatus === 'pending' ? 'animate-spin' : '')} />
            </Button>
          )}
        </div>
      </div>

      <div className="border border-border rounded-md">
        {queryStatus === 'pending' ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <Table data-cy="resource-usage-export-table">
            <TableScrollContainer>
              <TableContent aria-label={ariaLabel}>
                <TableHeader columns={columns}>
                  {(column) => (
                    <TableColumn key={column.key} id={column.key} isRowHeader={column.key === columns[0]?.key}>
                      {column.label}
                    </TableColumn>
                  )}
                </TableHeader>
                <TableBody items={limited} renderEmptyState={() => <EmptyState />}>
                  {(row) => (
                    <TableRow key={row.key} id={row.key}>
                      {row.columns.map((column) => (
                        <TableCell style={{ whiteSpace: 'nowrap' }} key={column.key}>
                          {column.value}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>
        )}
      </div>
    </div>
  );
}
