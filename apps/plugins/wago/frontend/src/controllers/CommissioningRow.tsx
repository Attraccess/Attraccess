import { TableRowActions, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Button, Chip, TableCell, TableRow } from '@heroui/react';
import { InfoIcon } from 'lucide-react';
import type { CommissioningSession } from '../api/client';
import { useWagoTranslations } from '../i18n';
import { cellClass, isResumable, type TableRowData } from './controllersTableModel';

export function CommissioningRow({
  row,
  onResume,
  onDetails,
}: {
  row: Extract<TableRowData, { kind: 'session' }>;
  onResume: (session: CommissioningSession) => void;
  onDetails: () => void;
}) {
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const { t } = useWagoTranslations();
  const { session } = row;
  const name = session.controllerName ?? session.hardwareId ?? t('controllers.enrollment');
  return (
    <TableRow key={row.key} id={row.key}>
      <TableCell className={cellClass}>
        <div className="wg:max-w-64">
          <div className="wg:truncate wg:font-medium" title={name}>
            {name}
          </div>
          <div className="wg:truncate wg:text-xs wg:text-muted" title={session.targetHost}>
            {session.targetHost || session.hardwareId}
          </div>
        </div>
      </TableCell>
      <TableCell className={cellClass}>
        <Chip color={session.failureReason ? 'warning' : 'default'} size="sm" variant="soft">
          {t(
            session.state === 'revoked'
              ? 'runtimeManagement.recoveryAvailable'
              : session.failureReason
                ? 'controllers.attention'
                : 'controllers.enrolling',
          )}
        </Chip>
      </TableCell>
      <TableCell className={cellClass}>—</TableCell>
      <TableCell className={`wg:hidden wg:lg:table-cell ${cellClass}`}>
        {session.updatedAt ? formatDateTime(session.updatedAt) : '—'}
      </TableCell>
      <TableCell className={cellClass}>
        {session.state !== 'revoked' && (
          <Button size="sm" variant="secondary" onPress={() => onResume(session)}>
            {t(isResumable(session.state) ? 'controllers.resume' : 'controllers.progress')}
          </Button>
        )}
      </TableCell>
      <TableCell className={cellClass}>
        <TableRowActions
          itemName={name}
          actions={[{ key: 'details', label: t('controllers.details'), icon: InfoIcon, onPress: onDetails }]}
        />
      </TableCell>
    </TableRow>
  );
}
