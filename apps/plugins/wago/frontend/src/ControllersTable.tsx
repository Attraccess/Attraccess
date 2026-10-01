import {
  Accordion,
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
import { useEffect, useState } from 'react';
import type { CommissioningSession, WagoCommissioningState, WagoController } from './api';
import {
  getRuntimeUpdateStatus,
  getManagedAccessStatus,
  getRootRecoveryPassword,
  retryManagedAccess,
  retryRuntimeUpdate,
  restoreManagedAccess,
} from './api';
import { useQuery } from '@tanstack/react-query';
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

type ManagedAccessTarget = { controller: WagoController } | { session: CommissioningSession };

export function ControllersTable({
  controllers,
  sessions,
  onClaim,
  onConfigure,
  onRemove,
  onResume,
}: ControllersTableProps) {
  const { t } = useWagoTranslations();
  const [runtimeUpdateTarget, setRuntimeUpdateTarget] = useState<ManagedAccessTarget | null>(null);
  const activeSessions = sessions.filter(
    (session) =>
      session.state !== 'completed' &&
      (session.state !== 'revoked' ||
        !!session.runtimeRecoveryAvailable ||
        !!session.managedAccessAvailable ||
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
                  <CommissioningRow
                    row={row}
                    onResume={onResume}
                    onRecover={(session) => setRuntimeUpdateTarget({ session })}
                  />
                ) : (
                  <ControllerRow
                    row={row}
                    onClaim={onClaim}
                    onConfigure={onConfigure}
                    onRemove={onRemove}
                    onResume={onResume}
                    onRecover={(session) => setRuntimeUpdateTarget({ session })}
                    onShowRuntimeUpdate={(controller) => setRuntimeUpdateTarget({ controller })}
                  />
                )
              }
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
      <RuntimeUpdateModal target={runtimeUpdateTarget} onOpenChange={(open) => !open && setRuntimeUpdateTarget(null)} />
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
  onRecover,
}: {
  row: Extract<TableRowData, { kind: 'controller' }>;
  onClaim: (controllerId: number) => void;
  onConfigure: (controllerId: number) => void;
  onRemove: (controller: WagoController) => void;
  onResume: (session: CommissioningSession) => void;
  onShowRuntimeUpdate: (controller: WagoController) => void;
  onRecover: (session: CommissioningSession) => void;
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
          {session?.managedAccessAvailable && controller.trustState !== 'claimed' && (
            <Button size="sm" variant="secondary" onPress={() => onRecover(session)}>
              {t('runtimeManagement.recoveryTitle')}
            </Button>
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
  target,
  onOpenChange,
}: {
  target: ManagedAccessTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useWagoTranslations();
  const controller = target && 'controller' in target ? target.controller : null;
  const title = controller ? t('runtimeUpdate.title') : t('runtimeManagement.recoveryTitle');
  return (
    <StandardModal isOpen={target !== null} onOpenChange={onOpenChange} size="lg" dialogProps={{ 'aria-label': title }}>
      <ModalHeader>
        <ModalHeading>{title}</ModalHeading>
      </ModalHeader>
      <ModalBody className="wg:space-y-3">
        {controller && (
          <p className="wg:text-sm">
            {t('runtimeUpdate.running')} <strong>{controller?.runtimeVersion}</strong> · {t('runtimeUpdate.protocol')}{' '}
            {controller?.protocolVersion}
          </p>
        )}
        {target && (
          <RuntimeUpdateDetails
            key={controller ? `controller-${controller.id}` : `session-${'session' in target && target.session.id}`}
            target={target}
          />
        )}
      </ModalBody>
      <ModalFooter>
        <Button onPress={() => onOpenChange(false)}>{t('runtimeUpdate.understood')}</Button>
      </ModalFooter>
    </StandardModal>
  );
}

function RuntimeUpdateDetails({ target }: { target: ManagedAccessTarget }) {
  const { t, language } = useWagoTranslations();
  const controllerId = 'controller' in target ? target.controller.id : null;
  const sessionId = 'session' in target ? target.session.id : null;
  const query = useQuery({
    queryKey: ['wago', 'runtime-update', controllerId, sessionId],
    queryFn: () =>
      'controller' in target ? getRuntimeUpdateStatus(target.controller.id) : getManagedAccessStatus(target.session.id),
    refetchInterval: 5000,
    retry: false,
  });
  const [password, setPassword] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lifetime] = useState(() => ({ active: true, recoveryExpanded: false, recoveryGeneration: 0 }));
  useEffect(() => {
    lifetime.active = true;
    return () => {
      lifetime.active = false;
    };
  }, [lifetime]);
  useEffect(() => {
    if (query.isError) {
      lifetime.recoveryGeneration++;
      lifetime.recoveryExpanded = false;
      setPassword(null);
    }
  }, [query.isError, lifetime]);
  const status = query.data;
  if (query.isError)
    return (
      <Alert status="warning">
        <Alert.Content>
          <Alert.Title>{t('runtimeManagement.unavailable')}</Alert.Title>
          <Alert.Description>{t('runtimeManagement.unavailableDescription')}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  if (!status) return <p role="status">{t('runtimeManagement.loading')}</p>;
  if (status.management === 'reenrol_required')
    return (
      <>
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('runtimeManagement.reenrol')}</Alert.Title>
            <Alert.Description>{t('runtimeManagement.reenrolDescription')}</Alert.Description>
          </Alert.Content>
        </Alert>
        {status.rolloutEnabled === false && <p role="status">{t('runtimeManagement.disabledDescription')}</p>}
      </>
    );
  const action = async (kind: 'password' | 'retry' | 'restore' | 'runtime') => {
    if (!status.sessionId) return;
    const generation = lifetime.recoveryGeneration;
    setPending(true);
    setFailed(false);
    try {
      if (kind === 'password') {
        const result = await getRootRecoveryPassword(status.sessionId);
        if (lifetime.active && lifetime.recoveryExpanded && lifetime.recoveryGeneration === generation)
          setPassword(result.password);
      } else {
        if (kind === 'runtime' && controllerId) await retryRuntimeUpdate(controllerId);
        else if (kind === 'restore') await restoreManagedAccess(status.sessionId);
        else await retryManagedAccess(status.sessionId);
        if (lifetime.active) await query.refetch();
      }
    } catch {
      if (lifetime.active) setFailed(true);
    } finally {
      if (lifetime.active) setPending(false);
    }
  };
  return (
    <>
      <Alert
        status={
          status.management === 'managed' && !status.update?.failure && status.rolloutEnabled !== false
            ? 'success'
            : 'warning'
        }
      >
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {status.management === 'managed'
              ? status.rolloutEnabled === false
                ? t('runtimeManagement.paused')
                : t('runtimeManagement.automatic')
              : status.management === 'retired'
                ? t('runtimeManagement.retired')
                : t('runtimeManagement.attention')}
          </Alert.Title>
          <Alert.Description>
            {status.management === 'retired'
              ? t('runtimeManagement.retiredDescription')
              : t('runtimeManagement.automaticDescription')}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <p>
        {t('runtimeManagement.managementLabel')} <strong>{t(`runtimeManagement.states.${status.management}`)}</strong>
      </p>
      <p>
        {t('runtimeManagement.updateLabel')}{' '}
        <strong>
          {status.update ? t(`runtimeManagement.phases.${status.update.phase}`) : t('runtimeManagement.waiting')}
        </strong>
      </p>
      {status.update && (
        <>
          <p>
            {t('runtimeManagement.desired')} <code className="wg:break-all">{status.update.desiredImageId}</code>
          </p>
          {status.update.failure && (
            <p role="status">
              {t('runtimeManagement.failure', { failure: t(`runtimeManagement.failures.${status.update.failure}`) })}{' '}
              {status.update.retryAt > 0 &&
                t('runtimeManagement.retryAfter', { date: new Date(status.update.retryAt).toLocaleString(language) })}
            </p>
          )}
          {!!status.update.cleanupRetryAt && (
            <p role="status">
              {t('runtimeManagement.cleanup', {
                date: new Date(status.update.cleanupRetryAt).toLocaleString(language),
              })}
            </p>
          )}
        </>
      )}
      {status.management === 'recovery_required' && (
        <Button
          variant="secondary"
          isPending={pending}
          isDisabled={status.rolloutEnabled === false}
          onPress={() => void action('retry')}
        >
          {t('runtimeManagement.retryAccess')}
        </Button>
      )}
      {controllerId &&
        status.management === 'managed' &&
        status.update &&
        (['failed', 'blocked', 'recovery_required'].includes(status.update.phase) ||
          !!status.update.cleanupRetryAt) && (
          <Button
            variant="secondary"
            isPending={pending}
            isDisabled={status.rolloutEnabled === false}
            onPress={() => void action('runtime')}
          >
            {t('runtimeManagement.retryRuntime')}
          </Button>
        )}
      {status.rolloutEnabled === false && <p role="status">{t('runtimeManagement.disabledDescription')}</p>}
      <p className="wg:text-sm wg:text-muted">{t('runtimeManagement.physical')}</p>
      <Accordion>
        <Accordion.Item
          onExpandedChange={(expanded) => {
            lifetime.recoveryExpanded = expanded;
            if (!expanded) {
              lifetime.recoveryGeneration++;
              setPassword(null);
            }
          }}
        >
          <Accordion.Heading>
            <Accordion.Trigger>
              {t('runtimeManagement.administratorRecovery')}
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <p className="wg:mb-3 wg:text-sm wg:text-muted">{t('runtimeManagement.recoveryDescription')}</p>
              <Button
                fullWidth
                className="wg:h-auto wg:min-h-8 wg:whitespace-normal wg:py-2"
                size="sm"
                variant="secondary"
                isDisabled={pending || !status.sessionId}
                onPress={() => (password ? setPassword(null) : void action('password'))}
              >
                {t(password ? 'runtimeManagement.hidePassword' : 'runtimeManagement.revealPassword')}
              </Button>
              {password && (
                <code className="wg:break-all" aria-label={t('runtimeManagement.passwordLabel')}>
                  {password}
                </code>
              )}
              <p className="wg:text-sm wg:text-muted">{t('runtimeManagement.restoreDescription')}</p>
              <Button
                fullWidth
                className="wg:h-auto wg:min-h-8 wg:whitespace-normal wg:py-2"
                size="sm"
                variant="secondary"
                isDisabled={pending || !status.sessionId}
                onPress={() => void action('restore')}
              >
                {t('runtimeManagement.restore')}
              </Button>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      {failed && <p role="alert">{t('runtimeManagement.actionFailed')}</p>}
    </>
  );
}

function CommissioningRow({
  row,
  onResume,
  onRecover,
}: {
  row: Extract<TableRowData, { kind: 'session' }>;
  onResume: (session: CommissioningSession) => void;
  onRecover: (session: CommissioningSession) => void;
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
        <Chip color={session.state === 'revoked' ? 'default' : 'accent'} size="sm" variant="soft">
          {t(session.state === 'revoked' ? 'commissioning.revoked' : 'controllers.enrolling')}
        </Chip>
      </TableCell>
      <TableCell>
        <Chip color="warning" size="sm" variant="soft">
          {t(session.state === 'revoked' ? 'runtimeManagement.recoveryAvailable' : 'controllers.inProgress')}
        </Chip>
      </TableCell>
      <TableCell className="wg:hidden wg:md:table-cell">{session.firmwareBaseline}</TableCell>
      <TableCell className="wg:hidden wg:lg:table-cell">
        {t('controllers.updated', { date: new Date(session.updatedAt).toLocaleString(language) })}
      </TableCell>
      <TableCell>
        <div className="wg:flex wg:justify-end wg:gap-2">
          <Button
            size="sm"
            variant={isResumable(session.state) ? 'primary' : 'secondary'}
            onPress={() => onResume(session)}
          >
            {t(
              isResumable(session.state)
                ? 'controllers.resume'
                : session.state === 'revoked'
                  ? 'runtimeManagement.sessionDetails'
                  : 'controllers.progress',
            )}
          </Button>
          {session.managedAccessAvailable && (
            <Button size="sm" variant="secondary" onPress={() => onRecover(session)}>
              {t('runtimeManagement.recoveryTitle')}
            </Button>
          )}
        </div>
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
