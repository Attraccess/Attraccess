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
          <TableContent aria-label="WAGO controllers and commissioning sessions">
            <TableHeader>
              <TableColumn isRowHeader>Controller</TableColumn>
              <TableColumn>Trust</TableColumn>
              <TableColumn>Connection</TableColumn>
              <TableColumn className="wg:hidden wg:md:table-cell">Runtime</TableColumn>
              <TableColumn className="wg:hidden wg:lg:table-cell">Last heartbeat</TableColumn>
              <TableColumn className="wg:text-end">Actions</TableColumn>
            </TableHeader>
            <TableBody items={rows} renderEmptyState={EmptyControllers}>
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
          <p className="wg:mt-1 wg:text-xs wg:text-danger">{controller.compatibilityError}</p>
        )}
      </TableCell>
      <TableCell className="wg:hidden wg:lg:table-cell">{formatHeartbeat(controller.lastHeartbeatAt)}</TableCell>
      <TableCell>
        <div className="wg:flex wg:justify-end wg:gap-2">
          {session && <SessionProgressAction session={session} onResume={onResume} />}
          {controller.trustState === 'untrusted' ? (
            !session && (
              <Button size="sm" onPress={() => onClaim(controller.id)}>
                Claim
              </Button>
            )
          ) : (
            <>
              <Button size="sm" variant="secondary" onPress={() => onConfigure(controller.id)}>
                Configure
              </Button>
              <Button size="sm" variant="ghost" onPress={() => onShowRuntimeUpdate(controller)}>
                Runtime updates
              </Button>
            </>
          )}
          {session?.managedAccessAvailable && controller.trustState !== 'claimed' && (
            <Button size="sm" variant="secondary" onPress={() => onRecover(session)}>
              Managed SSH recovery
            </Button>
          )}
          <Button size="sm" variant="danger" onPress={() => onRemove(controller)}>
            Remove
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
  const verification = useCommissioningVerification(session);
  if (verification.enrollmentComplete) return null;
  return (
    <Button size="sm" variant="secondary" onPress={() => onResume(session)}>
      View progress
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
  const controller = target && 'controller' in target ? target.controller : null;
  const title = controller ? 'Runtime update' : 'Managed SSH recovery';
  return (
    <StandardModal isOpen={target !== null} onOpenChange={onOpenChange} size="lg" dialogProps={{ 'aria-label': title }}>
      <ModalHeader>
        <ModalHeading>{title}</ModalHeading>
      </ModalHeader>
      <ModalBody className="wg:space-y-3">
        {controller && (
          <p className="wg:text-sm">
            Running runtime: <strong>{controller?.runtimeVersion}</strong> · protocol {controller?.protocolVersion}
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
        <Button onPress={() => onOpenChange(false)}>Understood</Button>
      </ModalFooter>
    </StandardModal>
  );
}

function RuntimeUpdateDetails({ target }: { target: ManagedAccessTarget }) {
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
          <Alert.Title>Update status unavailable</Alert.Title>
          <Alert.Description>
            Check access to Attraccess, then reopen this dialog. No update result is inferred from an unavailable
            status.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  if (!status) return <p role="status">Loading runtime update status…</p>;
  if (status.management === 'reenrol_required')
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Re-enrolment required</Alert.Title>
          <Alert.Description>
            This controller has no verified managed SSH identity. Remove it and enrol it again to provision encrypted
            management credentials for automatic updates. Re-enrolment is destructive and wipes applications, data and
            configuration on the CC100.
          </Alert.Description>
        </Alert.Content>
      </Alert>
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
                ? 'Runtime updates paused'
                : 'Automatic runtime updates'
              : status.management === 'retired'
                ? 'Automatic management retired'
                : 'Managed SSH needs attention'}
          </Alert.Title>
          <Alert.Description>
            {status.management === 'retired'
              ? 'This enrolment was retired. Its encrypted recovery credential remains available to administrators.'
              : 'Server builds update the runtime using its encrypted SSH key. Enrolled credentials and runtime state are preserved; failed updates restore the previous runtime.'}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <p>
        Management: <strong>{status.management.replaceAll('_', ' ')}</strong>
      </p>
      <p>
        Update: <strong>{status.update?.phase.replaceAll('_', ' ') ?? 'Waiting for reconciliation'}</strong>
      </p>
      {status.update && (
        <>
          <p>
            Desired image: <code className="wg:break-all">{status.update.desiredImageId}</code>
          </p>
          {status.update.failure && (
            <p role="status">
              Last failure: {status.update.failure.replaceAll('_', ' ')}.{' '}
              {status.update.retryAt > 0 && `Retry after ${new Date(status.update.retryAt).toLocaleString()}.`}
            </p>
          )}
          {!!status.update.cleanupRetryAt && (
            <p role="status">
              Runtime accepted; cleanup needs a retry after {new Date(status.update.cleanupRetryAt).toLocaleString()}.
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
          Retry managed access
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
            Retry runtime update
          </Button>
        )}
      {status.rolloutEnabled === false && (
        <p role="status">
          Managed enrolment and automatic updates are disabled pending FW31 qualification. Administrator recovery
          remains available.
        </p>
      )}
      <p className="wg:text-sm wg:text-muted">Physical FW31 qualification: unverified.</p>
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
              Administrator recovery
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <p className="wg:mb-3 wg:text-sm wg:text-muted">
                Root SSH is disabled after cutover. The recovery password is for administrator recovery, not routine
                updates.
              </p>
              <Button
                fullWidth
                size="sm"
                variant="secondary"
                isDisabled={pending || !status.sessionId}
                onPress={() => (password ? setPassword(null) : void action('password'))}
              >
                {password ? 'Hide recovery password' : 'Reveal root password (audited)'}
              </Button>
              {password && (
                <code className="wg:break-all" aria-label="Root recovery password">
                  {password}
                </code>
              )}
              <p className="wg:text-sm wg:text-muted">
                For recovery or re-enrolment, restoring bootstrap SSH retires automatic management and re-enables the
                previous SSH policy.
              </p>
              <Button
                fullWidth
                size="sm"
                variant="secondary"
                isDisabled={pending || !status.sessionId}
                onPress={() => void action('restore')}
              >
                Restore bootstrap SSH (audited)
              </Button>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      {failed && (
        <p role="alert">Action failed. Check administrator permissions, audit availability and controller access.</p>
      )}
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
  const { session } = row;
  return (
    <TableRow key={row.key} id={row.key} className="wg:bg-primary/5">
      <TableCell>
        <div className="wg:flex wg:min-w-0 wg:flex-col">
          <span className="wg:truncate wg:font-medium">{session.controllerName ?? 'CC100 enrollment'}</span>
          <span className="wg:truncate wg:text-xs wg:text-muted">
            {session.targetHost} · {session.hardwareId}
          </span>
          <CommissioningStatus session={session} />
        </div>
      </TableCell>
      <TableCell>
        <Chip color={session.state === 'revoked' ? 'default' : 'accent'} size="sm" variant="soft">
          {session.state === 'revoked' ? 'Revoked' : 'Enrolling'}
        </Chip>
      </TableCell>
      <TableCell>
        <Chip color="warning" size="sm" variant="soft">
          {session.state === 'revoked' ? 'Recovery available' : 'In progress'}
        </Chip>
      </TableCell>
      <TableCell className="wg:hidden wg:md:table-cell">{session.firmwareBaseline}</TableCell>
      <TableCell className="wg:hidden wg:lg:table-cell">
        Updated {new Date(session.updatedAt).toLocaleString()}
      </TableCell>
      <TableCell>
        <div className="wg:flex wg:justify-end wg:gap-2">
          <Button
            size="sm"
            variant={isResumable(session.state) ? 'primary' : 'secondary'}
            onPress={() => onResume(session)}
          >
            {isResumable(session.state) ? 'Resume' : session.state === 'revoked' ? 'Session details' : 'View progress'}
          </Button>
          {session.managedAccessAvailable && (
            <Button size="sm" variant="secondary" onPress={() => onRecover(session)}>
              Managed SSH recovery
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function CommissioningStatus({ session }: { session: CommissioningSession }) {
  const verification = useCommissioningVerification(session);
  const label = verification.enrollmentComplete
    ? verification.runtimeVerified
      ? 'Enrollment complete · runtime verified'
      : 'Enrollment complete · runtime setup pending'
    : verification.unavailable
      ? 'Verification status unavailable'
      : commissioningLabel(session.state);
  return (
    <span className="wg:mt-1 wg:text-xs wg:text-primary">
      {label}
      {session.failureReason ? `: ${session.failureReason}` : ''}
    </span>
  );
}

function EmptyControllers() {
  return (
    <div className="wg:px-4 wg:py-12 wg:text-center wg:text-sm wg:text-muted">
      No controllers or commissioning sessions yet.
    </div>
  );
}

function TrustChip({ trustState }: Pick<WagoController, 'trustState'>) {
  return (
    <Chip color={trustState === 'claimed' ? 'success' : 'warning'} size="sm" variant="soft">
      {trustState}
    </Chip>
  );
}

function ConnectivityChip({ connectivity }: Pick<WagoController, 'connectivity'>) {
  const color = connectivity === 'online' ? 'success' : connectivity === 'stale' ? 'warning' : 'default';
  return (
    <Chip color={color} size="sm" variant="soft">
      {connectivity}
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

export function commissioningLabel(state: WagoCommissioningState): string {
  return {
    awaiting_delivery: 'Preparing automatic delivery',
    delivering: 'Delivering commissioning runtime',
    awaiting_identity_confirmation: 'Ready to verify the physical controller',
    awaiting_codesys_confirmation: 'Waiting for destructive installation approval',
    delivery_failed: 'Delivery needs attention',
    awaiting_discovery: 'Waiting for the controller to connect',
    awaiting_claim: 'Claiming automatically',
    completed: 'Claimed',
    awaiting_verification: 'Verification required',
    claim_interrupted: 'Claim recovery required',
    recovery_revocation_pending: 'Restored; revocation pending',
    revoked: 'Revoked',
  }[state];
}

function formatHeartbeat(lastHeartbeatAt: string | null): string {
  return lastHeartbeatAt ? new Date(lastHeartbeatAt).toLocaleString() : 'Never';
}
