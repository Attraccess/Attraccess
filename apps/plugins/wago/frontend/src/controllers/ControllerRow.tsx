import { useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Button, TableCell, TableRow } from '@heroui/react';
import { useWagoTranslations } from '../i18n';
import { RuntimeUpdateSummary } from '../runtime/RuntimeUpdateSummary';
import { useRuntimeStatus } from '../runtime/useRuntimeStatus';
import { ControllerStatus } from './ControllerStatus';
import { cellClass, type TableRowData } from './controllersTableModel';

export function ControllerRow({
  row,
  onClaim,
  onConfigure,
  onDetails,
}: {
  row: Extract<TableRowData, { kind: 'controller' }>;
  onClaim: (id: number) => void;
  onConfigure: (id: number) => void;
  onDetails: () => void;
}) {
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const { t } = useWagoTranslations();
  const { controller, session } = row;
  const target =
    controller.trustState === 'claimed' ? { controller } : session?.managedAccessAvailable ? { session } : null;
  const query = useRuntimeStatus(target);
  const status = query.isError ? undefined : query.data;
  return (
    <TableRow key={row.key} id={row.key}>
      <TableCell className={cellClass}>
        <div className="wg:max-w-64">
          <div className="wg:truncate wg:font-medium" title={controller.name ?? controller.hardwareId}>
            {controller.name ?? controller.hardwareId}
          </div>
          <div className="wg:truncate wg:text-xs wg:text-muted" title={controller.hardwareId}>
            {controller.hardwareId}
          </div>
        </div>
      </TableCell>
      <TableCell className={cellClass}>
        <ControllerStatus controller={controller} session={session} status={status} unavailable={query.isError} />
      </TableCell>
      <TableCell className={cellClass}>
        <RuntimeUpdateSummary controller={controller} status={status} unavailable={query.isError} compact />
      </TableCell>
      <TableCell className={`wg:hidden wg:lg:table-cell ${cellClass}`}>
        {controller.lastHeartbeatAt ? formatDateTime(controller.lastHeartbeatAt) : '—'}
      </TableCell>
      <TableCell className={cellClass}>
        <div className="wg:flex wg:justify-end wg:gap-2">
          {controller.trustState === 'claimed' ? (
            <Button size="sm" variant="secondary" onPress={() => onConfigure(controller.id)}>
              {t('controllers.configure')}
            </Button>
          ) : (
            !session && (
              <Button size="sm" onPress={() => onClaim(controller.id)}>
                {t('controllers.claim')}
              </Button>
            )
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('controllers.detailsFor', { name: controller.name ?? controller.hardwareId })}
            onPress={onDetails}
          >
            {t('controllers.details')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
