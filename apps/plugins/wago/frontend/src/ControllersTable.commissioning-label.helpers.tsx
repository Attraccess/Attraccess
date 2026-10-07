import type { WagoCommissioningState } from './api';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import { Button } from '@heroui/react';
import { Chip } from '@heroui/react';
import { TableCell } from '@heroui/react';
import { TableRow } from '@heroui/react';
import type { CommissioningSession } from './api';
import { useWagoTranslations } from './i18n';
import type { TableRowData } from './ControllersTable.contracts';
import { cellClass } from './ControllersTable.state';
import { isResumable } from './ControllersTable.controller-status.helpers';
import { useCommissioningVerification } from './useCommissioningVerification';
import { useRuntimeStatus } from './useRuntimeStatus';
import { RuntimeUpdateSummary } from './RuntimeUpdateSummary';
import { ControllerStatus } from './ControllersTable.controller-status.helpers';

export function commissioningLabel(state: WagoCommissioningState, t?: TFunction): string {
  return t ? t(`commissioning.${state}`) : en.commissioning[state];
}

export function CommissioningRow({
  row,
  onResume,
  onDetails,
}: {
  row: Extract<TableRowData, { kind: 'session' }>;
  onResume: (session: CommissioningSession) => void;
  onDetails: () => void;
}) {
  const { t, language } = useWagoTranslations();
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
        {session.updatedAt
          ? new Date(session.updatedAt).toLocaleString(language, { dateStyle: 'short', timeStyle: 'short' })
          : '—'}
      </TableCell>
      <TableCell className={cellClass}>
        <div className="wg:flex wg:justify-end wg:gap-2">
          {session.state !== 'revoked' && (
            <Button size="sm" variant="secondary" onPress={() => onResume(session)}>
              {t(isResumable(session.state) ? 'controllers.resume' : 'controllers.progress')}
            </Button>
          )}
          <Button size="sm" variant="ghost" aria-label={t('controllers.detailsFor', { name })} onPress={onDetails}>
            {t('controllers.details')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CommissioningStatus({
  session,
  runtimeUpdate = false,
}: {
  session: CommissioningSession;
  runtimeUpdate?: boolean;
}) {
  const { t } = useWagoTranslations();
  const verification = useCommissioningVerification(session);
  const label = verification.enrollmentComplete
    ? runtimeUpdate
      ? t('controllers.runtimeUpdatePending')
      : verification.runtimeVerified
        ? t('controllers.verified')
        : t('controllers.pending')
    : verification.unavailable
      ? t('controllers.unavailable')
      : commissioningLabel(session.state, t);
  return <span className="wg:mt-1 wg:text-xs wg:text-primary">{label}</span>;
}

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
  const { t, language } = useWagoTranslations();
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
        {controller.lastHeartbeatAt
          ? new Date(controller.lastHeartbeatAt).toLocaleString(language, { dateStyle: 'short', timeStyle: 'short' })
          : '—'}
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
