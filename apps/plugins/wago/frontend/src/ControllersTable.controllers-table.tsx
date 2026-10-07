import {
  Input,
  Pagination,
  TextField,
  Table,
  TableBody,
  TableColumn,
  TableContent,
  TableHeader,
  TableScrollContainer,
} from '@heroui/react';
import { useState } from 'react';
import type { CommissioningSession } from './api';
import { useWagoTranslations } from './i18n';
import type { ControllersTableProps } from './ControllersTable.contracts';
import type { TableRowData } from './ControllersTable.contracts';
import { PAGE_SIZE } from './ControllersTable.state';
import { EmptyControllers } from './ControllersTable.controller-status.helpers';
import { CommissioningRow } from './ControllersTable.commissioning-label.helpers';
import { ControllerRow } from './ControllersTable.commissioning-label.helpers';
import { ControllerDetailsDrawer } from './ControllersTable.controller-details-drawer';

export function ControllersTable({
  controllers,
  sessions,
  onClaim,
  onConfigure,
  onRemove,
  onResume,
}: ControllersTableProps) {
  const { t } = useWagoTranslations();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const activeSessions = sessions.filter(
    (session) =>
      session.state !== 'completed' &&
      (session.state !== 'revoked' ||
        !!session.runtimeRecoveryAvailable ||
        !!session.managedAccessAvailable ||
        !!session.dockerProvisionState ||
        !!session.managementControllerId),
  );
  const sessionsByHardware = new Map<string, CommissioningSession>();
  for (const session of sessions) {
    if (!sessionsByHardware.has(session.hardwareId)) sessionsByHardware.set(session.hardwareId, session);
  }
  const controllerHardware = new Set(controllers.map((controller) => controller.hardwareId));
  const rows: TableRowData[] = [
    ...controllers.map((controller) => ({
      key: `controller-${controller.id}`,
      kind: 'controller' as const,
      controller,
      session: sessionsByHardware.get(controller.hardwareId) ?? null,
    })),
    ...activeSessions
      .filter((session) => !controllerHardware.has(session.hardwareId))
      .map((session) => ({ key: `session-${session.id}`, kind: 'session' as const, session })),
  ];
  const needle = search.trim().toLocaleLowerCase();
  const filtered = rows.filter((row) =>
    [
      row.kind === 'controller' ? row.controller.name : row.session.controllerName,
      row.kind === 'controller' ? row.controller.hardwareId : row.session.hardwareId,
      row.session?.targetHost,
    ].some((value) => value?.toLocaleLowerCase().includes(needle)),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleRows = filtered.slice(start, start + PAGE_SIZE);
  const selectedRow = rows.find((row) => row.key === selectedKey);

  return (
    <div className="wg:space-y-3">
      <TextField
        aria-label={t('controllers.search')}
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        className="wg:max-w-sm"
      >
        <Input type="search" placeholder={t('controllers.search')} />
      </TextField>
      <Table>
        <TableScrollContainer>
          <TableContent aria-label={t('controllers.table')}>
            <TableHeader>
              <TableColumn isRowHeader>{t('controllers.controller')}</TableColumn>
              <TableColumn>{t('controllers.status')}</TableColumn>
              <TableColumn>{t('controllers.runtime')}</TableColumn>
              <TableColumn className="wg:hidden wg:lg:table-cell">{t('controllers.heartbeat')}</TableColumn>
              <TableColumn className="wg:text-end">{t('controllers.actions')}</TableColumn>
            </TableHeader>
            <TableBody items={visibleRows} renderEmptyState={() => <EmptyControllers searching={!!needle} />}>
              {(row) =>
                row.kind === 'session' ? (
                  <CommissioningRow row={row} onResume={onResume} onDetails={() => setSelectedKey(row.key)} />
                ) : (
                  <ControllerRow
                    row={row}
                    onClaim={onClaim}
                    onConfigure={onConfigure}
                    onDetails={() => setSelectedKey(row.key)}
                  />
                )
              }
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
      {filtered.length > PAGE_SIZE && (
        <Pagination size="sm" aria-label={t('controllers.pagination')}>
          <Pagination.Summary>
            {t('controllers.pageSummary', {
              from: start + 1,
              to: Math.min(start + PAGE_SIZE, filtered.length),
              total: filtered.length,
            })}
          </Pagination.Summary>
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous isDisabled={currentPage === 1} onPress={() => setPage(currentPage - 1)}>
                <Pagination.PreviousIcon />
                {t('controllers.previousPage')}
              </Pagination.Previous>
            </Pagination.Item>
            <Pagination.Item>
              <span className="wg:px-3 wg:text-sm">
                {t('controllers.pageNumber', { page: currentPage, total: totalPages })}
              </span>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Next isDisabled={currentPage === totalPages} onPress={() => setPage(currentPage + 1)}>
                {t('controllers.nextPage')}
                <Pagination.NextIcon />
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      )}
      {selectedRow && (
        <ControllerDetailsDrawer
          key={selectedRow.key}
          row={selectedRow}
          onClose={() => setSelectedKey(null)}
          onConfigure={onConfigure}
          onRemove={onRemove}
          onResume={onResume}
        />
      )}
    </div>
  );
}
