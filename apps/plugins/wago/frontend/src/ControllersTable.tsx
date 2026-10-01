import {
  Alert,
  Button,
  Chip,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { StandardModal } from '@attraccess/plugins-frontend-sdk';
import { useState } from 'react';
import type { CommissioningSession, WagoCommissioningState, WagoController } from './api';
import { useCommissioningVerification } from './useCommissioningVerification';
import { useWagoTranslations } from './i18n';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import en from './en.json';

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

export function ControllersTable({
  controllers,
  sessions,
  onClaim,
  onConfigure,
  onRemove,
  onResume,
}: ControllersTableProps) {
  const { t } = useWagoTranslations();
  const [runtimeUpdateController, setRuntimeUpdateController] = useState<WagoController | null>(null);
  const activeSessions = sessions.filter(
    (session) =>
      session.state !== 'completed' &&
      (session.state !== 'revoked' ||
        !!session.runtimeRecoveryAvailable ||
        !!session.dockerProvisionState ||
        !!session.managementControllerId),
  );
  const rows: TableRowData[] = [
    ...controllers.map((controller) => ({
      key: `controller-${controller.id}`,
      kind: 'controller' as const,
      controller,
      session: activeSessions.find((session) => session.hardwareId === controller.hardwareId) ?? null,
    })),
    ...activeSessions
      .filter((session) => !controllers.some((controller) => controller.hardwareId === session.hardwareId))
      .map((session) => ({ key: `session-${session.id}`, kind: 'session' as const, session })),
  ];

  return (
    <>
      <Table>
        <TableScrollContainer>
          <TableContent aria-label={t('controllers.table')}>
            <TableHeader>
              <TableColumn isRowHeader>{t('controllers.controller')}</TableColumn>
              <TableColumn>{t('controllers.trust')}</TableColumn>
              <TableColumn>{t('controllers.connection')}</TableColumn>
              <TableColumn className="wg:hidden wg:md:table-cell">{t('controllers.runtime')}</TableColumn>
              <TableColumn className="wg:hidden wg:lg:table-cell">{t('controllers.heartbeat')}</TableColumn>
              <TableColumn className="wg:text-end">{t('controllers.actions')}</TableColumn>
            </TableHeader>
            <TableBody items={rows} renderEmptyState={() => <EmptyControllers />}>
              {(row) =>
                row.kind === 'session' ? (
                  <CommissioningRow row={row} onResume={onResume} />
                ) : (
                  <ControllerRow
                    row={row}
                    onClaim={onClaim}
                    onConfigure={onConfigure}
                    onRemove={onRemove}
                    onResume={onResume}
                    onShowRuntimeUpdate={setRuntimeUpdateController}
                  />
                )
              }
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
      <RuntimeUpdateModal
        controller={runtimeUpdateController}
        onOpenChange={(open) => !open && setRuntimeUpdateController(null)}
      />
    </>
  );
}

function ControllerRow({
  row,
  onClaim,
  onConfigure,
  onRemove,
  onResume,
  onShowRuntimeUpdate,
}: {
  row: Extract<TableRowData, { kind: 'controller' }>;
  onClaim: (controllerId: number) => void;
  onConfigure: (controllerId: number) => void;
  onRemove: (controller: WagoController) => void;
  onResume: (session: CommissioningSession) => void;
  onShowRuntimeUpdate: (controller: WagoController) => void;
}) {
  const { t, language, tBackendMessage } = useWagoTranslations();
  const { controller, session } = row;
  return (
    <TableRow key={row.key} id={row.key} className={session ? 'wg:bg-primary/5' : undefined}>
      <TableCell>
        <div className="wg:flex wg:min-w-0 wg:flex-col">
          <span className="wg:truncate wg:font-medium">{controller.name ?? controller.hardwareId}</span>
          <span className="wg:truncate wg:text-xs wg:text-muted">{controller.hardwareId}</span>
          {session && <CommissioningStatus session={session} />}
        </div>
      </TableCell>
      <TableCell>
        <TrustChip trustState={controller.trustState} />
      </TableCell>
      <TableCell>
        <ConnectivityChip connectivity={controller.connectivity} />
      </TableCell>
      <TableCell className="wg:hidden wg:md:table-cell">
        <div>
          {controller.protocolVersion} / {controller.runtimeVersion}
        </div>
        {controller.compatibilityError && (
          <p className="wg:mt-1 wg:text-xs wg:text-danger">{tBackendMessage(controller.compatibilityError)}</p>
        )}
      </TableCell>
      <TableCell className="wg:hidden wg:lg:table-cell">
        {controller.lastHeartbeatAt
          ? new Date(controller.lastHeartbeatAt).toLocaleString(language)
          : t('controllers.never')}
      </TableCell>
      <TableCell>
        <div className="wg:flex wg:justify-end wg:gap-2">
          {session && <SessionProgressAction session={session} onResume={onResume} />}
          {controller.trustState === 'untrusted' ? (
            !session && (
              <Button size="sm" onPress={() => onClaim(controller.id)}>
                {t('controllers.claim')}
              </Button>
            )
          ) : (
            <>
              <Button size="sm" variant="secondary" onPress={() => onConfigure(controller.id)}>
                {t('controllers.configure')}
              </Button>
              <Button size="sm" variant="ghost" onPress={() => onShowRuntimeUpdate(controller)}>
                {t('controllers.updateRuntime')}
              </Button>
            </>
          )}
          <Button size="sm" variant="danger" onPress={() => onRemove(controller)}>
            {t('common.remove')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
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

function RuntimeUpdateModal({
  controller,
  onOpenChange,
}: {
  controller: WagoController | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <StandardModal
      isOpen={controller !== null}
      onOpenChange={onOpenChange}
      size="sm"
      dialogProps={{ 'aria-label': t('runtimeUpdate.title') }}
    >
      <ModalHeader>
        <ModalHeading>{t('runtimeUpdate.title')}</ModalHeading>
      </ModalHeader>
      <ModalBody>
        <p className="wg:text-sm">
          {t('runtimeUpdate.running')} <strong>{controller?.runtimeVersion}</strong> · {t('runtimeUpdate.protocol')}{' '}
          {controller?.protocolVersion}
        </p>
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('runtimeUpdate.unavailable')}</Alert.Title>
            <Alert.Description>{t('runtimeUpdate.description')}</Alert.Description>
          </Alert.Content>
        </Alert>
      </ModalBody>
      <ModalFooter>
        <Button onPress={() => onOpenChange(false)}>{t('runtimeUpdate.understood')}</Button>
      </ModalFooter>
    </StandardModal>
  );
}

function CommissioningRow({
  row,
  onResume,
}: {
  row: Extract<TableRowData, { kind: 'session' }>;
  onResume: (session: CommissioningSession) => void;
}) {
  const { t, language } = useWagoTranslations();
  const { session } = row;
  return (
    <TableRow key={row.key} id={row.key} className="wg:bg-primary/5">
      <TableCell>
        <div className="wg:flex wg:min-w-0 wg:flex-col">
          <span className="wg:truncate wg:font-medium">{session.controllerName ?? t('controllers.enrollment')}</span>
          <span className="wg:truncate wg:text-xs wg:text-muted">
            {session.targetHost} · {session.hardwareId}
          </span>
          <CommissioningStatus session={session} />
        </div>
      </TableCell>
      <TableCell>
        <Chip color="accent" size="sm" variant="soft">
          {t('controllers.enrolling')}
        </Chip>
      </TableCell>
      <TableCell>
        <Chip color="warning" size="sm" variant="soft">
          {t('controllers.inProgress')}
        </Chip>
      </TableCell>
      <TableCell className="wg:hidden wg:md:table-cell">{session.firmwareBaseline}</TableCell>
      <TableCell className="wg:hidden wg:lg:table-cell">
        {t('controllers.updated', { date: new Date(session.updatedAt).toLocaleString(language) })}
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          variant={isResumable(session.state) ? 'primary' : 'secondary'}
          onPress={() => onResume(session)}
        >
          {t(isResumable(session.state) ? 'controllers.resume' : 'controllers.progress')}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function CommissioningStatus({ session }: { session: CommissioningSession }) {
  const { t, tBackendMessage } = useWagoTranslations();
  const verification = useCommissioningVerification(session);
  const label = verification.enrollmentComplete
    ? verification.runtimeVerified
      ? t('controllers.verified')
      : t('controllers.pending')
    : verification.unavailable
      ? t('controllers.unavailable')
      : commissioningLabel(session.state, t);
  return (
    <span className="wg:mt-1 wg:text-xs wg:text-primary">
      {label}
      {session.failureReason ? `: ${tBackendMessage(session.failureReason)}` : ''}
    </span>
  );
}

function EmptyControllers() {
  const { t } = useWagoTranslations();
  return <div className="wg:px-4 wg:py-12 wg:text-center wg:text-sm wg:text-muted">{t('controllers.empty')}</div>;
}

function TrustChip({ trustState }: Pick<WagoController, 'trustState'>) {
  const { t } = useWagoTranslations();
  return (
    <Chip color={trustState === 'claimed' ? 'success' : 'warning'} size="sm" variant="soft">
      {t(`trust.${trustState}`)}
    </Chip>
  );
}

function ConnectivityChip({ connectivity }: Pick<WagoController, 'connectivity'>) {
  const { t } = useWagoTranslations();
  const color = connectivity === 'online' ? 'success' : connectivity === 'stale' ? 'warning' : 'default';
  return (
    <Chip color={color} size="sm" variant="soft">
      {t(`connectivity.${connectivity}`)}
    </Chip>
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
