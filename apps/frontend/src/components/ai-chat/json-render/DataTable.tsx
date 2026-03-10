import React from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from '@heroui/react';

interface DataTableData {
  type: 'data-table';
  title?: string;
  columns: string[];
  rows: string[][];
}

export function DataTable({ data }: { data: DataTableData }) {
  return (
    <div className="my-2">
      {data.title && <p className="text-xs font-medium text-default-600 mb-1">{data.title}</p>}
      <Table aria-label={data.title || 'Data table'} isCompact removeWrapper classNames={{ base: 'max-h-[300px] overflow-auto' }}>
        <TableHeader>
          {data.columns.map((col, i) => (
            <TableColumn key={i}>{col}</TableColumn>
          ))}
        </TableHeader>
        <TableBody>
          {data.rows.map((row, ri) => (
            <TableRow key={ri}>
              {row.map((cell, ci) => (
                <TableCell key={ci}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function isDataTable(data: unknown): data is DataTableData {
  const d = data as Record<string, unknown>;
  return d?.type === 'data-table' && Array.isArray(d?.columns);
}
