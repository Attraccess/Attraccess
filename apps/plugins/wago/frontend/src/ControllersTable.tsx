import {
  Alert,
  Button,
  Chip,
  Drawer,
  Input,
  Pagination,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { useState } from 'react';
import type { CommissioningSession, RuntimeUpdateStatus, WagoCommissioningState, WagoController } from './api';
import { useRuntimeStatus } from './useRuntimeStatus';
import { RuntimeUpdateDetails } from './RuntimeUpdateDetails';
import { useCommissioningVerification } from './useCommissioningVerification';
import { useWagoTranslations } from './i18n';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import { RuntimeUpdateSummary } from './RuntimeUpdateSummary';

export { RuntimeUpdateDetails } from './RuntimeUpdateDetails';

interface ControllersTableProps {
  controllers: WagoController[];
  sessions: CommissioningSession[];
  onClaim: (controllerId: number) => void;
  onConfigure: (controllerId: number) => void;
  onRemove: (controller: WagoController) => void;
  onResume: (session: CommissioningSession) => void;
}

type TableRowData =
  | { key: string; kind: 'controller'; controller: WagoController; session: CommissioningSession | null }
  | { key: string; kind: 'session'; session: CommissioningSession };

const PAGE_SIZE = 25;
const cellClass = 'wg:whitespace-nowrap wg:align-middle';

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

function ControllerRow({
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

function ControllerStatus({
  controller,
  session,
  status,
  unavailable,
}: {
  controller: WagoController;
  session: CommissioningSession | null;
  status?: RuntimeUpdateStatus;
  unavailable: boolean;
}) {
  const { t } = useWagoTranslations();
  const checkingEnrollment = session?.state === 'awaiting_verification';
  const verification = useCommissioningVerification(checkingEnrollment ? session : { id: 0, state: 'revoked' });
  const imageMismatch = !!(
    status?.runtime?.runningImageId &&
    status.runtime.desiredImageId &&
    status.runtime.runningImageId !== status.runtime.desiredImageId
  );
  const updating = controller.connectivity === 'runtime_update' || status?.runtimeUpdateRequired || imageMismatch;
  let label = t(`connectivity.${controller.connectivity}`);
  let color: 'success' | 'warning' | 'danger' | 'default' =
    controller.connectivity === 'online' ? 'success' : controller.connectivity === 'stale' ? 'warning' : 'default';
  if (controller.trustState !== 'claimed') {
    label = t(session ? 'controllers.enrolling' : 'connectivity.untrusted');
    color = 'warning';
  } else if (updating) {
    label = t('connectivity.runtime_update');
    color = 'warning';
  } else if (controller.connectivity !== 'online') {
    label = t(`connectivity.${controller.connectivity}`);
  } else if (unavailable || verification.unavailable) {
    label = t('controllers.unavailable');
    color = 'warning';
  } else if (
    controller.compatibilityError ||
    status?.blocker ||
    status?.update?.failure ||
    ['recovery_required', 'reenrol_required'].includes(status?.management ?? '')
  ) {
    label = t('controllers.attention');
    color = 'warning';
  } else if (
    ['pending', 'verified'].includes(status?.management ?? '') ||
    (checkingEnrollment && (!verification.enrollmentComplete || !verification.runtimeVerified))
  ) {
    label = t('controllers.setupPending');
    color = 'warning';
  }
  return (
    <div className="wg:space-y-1">
      <Chip size="sm" variant="soft" color={color}>
        {label}
      </Chip>
      {updating && controller.connectivity === 'stale' && (
        <div className="wg:text-xs wg:text-muted">{t('connectivity.stale')}</div>
      )}
    </div>
  );
}

function ControllerDetailsDrawer({
  row,
  onClose,
  onConfigure,
  onRemove,
  onResume,
}: {
  row: TableRowData;
  onClose: () => void;
  onConfigure: (id: number) => void;
  onRemove: (controller: WagoController) => void;
  onResume: (session: CommissioningSession) => void;
}) {
  const { t, language, tBackendMessage } = useWagoTranslations();
  const controller = row.kind === 'controller' ? row.controller : null;
  const session = row.session;
  const name = controller?.name ?? session?.controllerName ?? controller?.hardwareId ?? t('controllers.enrollment');
  const target =
    controller?.trustState === 'claimed' ? { controller } : session?.managedAccessAvailable ? { session } : null;
  const configure = () => {
    if (controller) {
      onClose();
      onConfigure(controller.id);
    }
  };
  return (
    <Drawer.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Content placement="right">
        <Drawer.Dialog aria-label={t('controllers.detailsFor', { name })} className="wg:w-full wg:max-w-xl">
          <Drawer.Header>
            <Drawer.Heading>{name}</Drawer.Heading>
            <Drawer.CloseTrigger aria-label={t('common.close')} />
          </Drawer.Header>
          <Drawer.Body className="wg:space-y-4">
            <dl className="wg:space-y-2">
              <div>
                <dt className="wg:text-sm wg:text-muted">{t('controllers.hardwareId')}</dt>
                <dd className="wg:break-all">{controller?.hardwareId ?? session?.hardwareId}</dd>
              </div>
              {controller && (
                <div>
                  <dt className="wg:text-sm wg:text-muted">{t('controllers.registration')}</dt>
                  <dd>{t(`trust.${controller.trustState}`)}</dd>
                </div>
              )}
              {session?.targetHost && (
                <div>
                  <dt className="wg:text-sm wg:text-muted">{t('controllers.address')}</dt>
                  <dd>{session.targetHost}</dd>
                </div>
              )}
              {controller && (
                <div>
                  <dt className="wg:text-sm wg:text-muted">{t('controllers.heartbeat')}</dt>
                  <dd>
                    {controller.lastHeartbeatAt
                      ? new Date(controller.lastHeartbeatAt).toLocaleString(language)
                      : t('controllers.never')}
                  </dd>
                </div>
              )}
              {session?.firmwareBaseline && (
                <div>
                  <dt className="wg:text-sm wg:text-muted">{t('controllers.systemFirmware')}</dt>
                  <dd>{session.firmwareBaseline}</dd>
                </div>
              )}
            </dl>
            {session && (
              <CommissioningStatus session={session} runtimeUpdate={controller?.connectivity === 'runtime_update'} />
            )}
            {controller?.compatibilityError && (
              <Alert status="warning">
                <Alert.Content>
                  <Alert.Description>{tBackendMessage(controller.compatibilityError)}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}
            {target && <RuntimeUpdateDetails target={target} />}
            {session?.failureReason && <p role="alert">{tBackendMessage(session.failureReason)}</p>}
          </Drawer.Body>
          <Drawer.Footer className="wg:flex wg:flex-wrap wg:gap-2">
            {controller?.trustState === 'claimed' && <Button onPress={configure}>{t('controllers.configure')}</Button>}
            {session && (
              <SessionProgressAction
                session={session}
                onResume={(value) => {
                  onClose();
                  onResume(value);
                }}
              />
            )}
            {controller && (
              <Button
                variant="danger"
                onPress={() => {
                  onClose();
                  onRemove(controller);
                }}
              >
                {t('common.remove')}
              </Button>
            )}
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

/** Hides "View progress" once commissioning evidence is verified; a stuck backend state should not read as still in progress. */
function SessionProgressAction({
  session,
  onResume,
}: {
  session: CommissioningSession;
  onResume: (session: CommissioningSession) => void;
}) {
  const { t } = useWagoTranslations();
  const verification = useCommissioningVerification(session);
  if (verification.enrollmentComplete) return null;
  return (
    <Button size="sm" variant="secondary" onPress={() => onResume(session)}>
      {t('controllers.progress')}
    </Button>
  );
}

function CommissioningRow({
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

function CommissioningStatus({
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

function EmptyControllers({ searching = false }: { searching?: boolean }) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:px-4 wg:py-12 wg:text-center wg:text-sm wg:text-muted">
      {t(searching ? 'controllers.noResults' : 'controllers.empty')}
    </div>
  );
}

function isResumable(state: WagoCommissioningState): boolean {
  return [
    'awaiting_delivery',
    'delivering',
    'awaiting_identity_confirmation',
    'awaiting_codesys_confirmation',
    'delivery_failed',
  ].includes(state);
}

export function commissioningLabel(state: WagoCommissioningState, t?: TFunction): string {
  return t ? t(`commissioning.${state}`) : en.commissioning[state];
}
