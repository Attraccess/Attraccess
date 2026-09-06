import {
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import type { CommissioningSession, WagoCommissioningState, WagoController } from './api';

interface ControllersTableProps {
  controllers: WagoController[];
  sessions: CommissioningSession[];
  onClaim: (controllerId: number) => void;
  onConfigure: (controllerId: number) => void;
  onDiagnostics: (controllerId: number) => void;
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
  onDiagnostics,
  onRemove,
  onResume,
}: ControllersTableProps) {
  const activeSessions = sessions.filter(
    (session) =>
      session.state !== 'completed' &&
      (session.state !== 'revoked' || !!session.runtimeRecoveryAvailable || !!session.dockerProvisionState || !!session.managementControllerId),
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
                <CommissioningRow row={row} onResume={onResume} />
              ) : (
                <ControllerRow
                  row={row}
                  onClaim={onClaim}
                  onConfigure={onConfigure}
                  onDiagnostics={onDiagnostics}
                  onRemove={onRemove}
                  onResume={onResume}
                />
              )
            }
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}

function ControllerRow({
  row,
  onClaim,
  onConfigure,
  onDiagnostics,
  onRemove,
  onResume,
}: {
  row: Extract<TableRowData, { kind: 'controller' }>;
  onClaim: (controllerId: number) => void;
  onConfigure: (controllerId: number) => void;
  onDiagnostics: (controllerId: number) => void;
  onRemove: (controller: WagoController) => void;
  onResume: (session: CommissioningSession) => void;
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
          <Button size="sm" variant="secondary" onPress={() => onDiagnostics(controller.id)}>
            Diagnostics
          </Button>
          {session && (
            <Button size="sm" variant="secondary" onPress={() => onResume(session)}>
              View progress
            </Button>
          )}
          {controller.trustState === 'untrusted' ? (
            !session && (
              <Button size="sm" onPress={() => onClaim(controller.id)}>
                Claim
              </Button>
            )
          ) : (
            <Button size="sm" variant="secondary" onPress={() => onConfigure(controller.id)}>
              Configure
            </Button>
          )}
          <Button size="sm" variant="danger-soft" onPress={() => onRemove(controller)}>
            Remove
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CommissioningRow({
  row,
  onResume,
}: {
  row: Extract<TableRowData, { kind: 'session' }>;
  onResume: (session: CommissioningSession) => void;
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
        <Chip color="accent" size="sm" variant="soft">
          Enrolling
        </Chip>
      </TableCell>
      <TableCell>
        <Chip color="warning" size="sm" variant="soft">
          In progress
        </Chip>
      </TableCell>
      <TableCell className="wg:hidden wg:md:table-cell">{session.firmwareBaseline}</TableCell>
      <TableCell className="wg:hidden wg:lg:table-cell">
        Updated {new Date(session.updatedAt).toLocaleString()}
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          variant={isResumable(session.state) ? 'primary' : 'secondary'}
          onPress={() => onResume(session)}
        >
          {isResumable(session.state) ? 'Resume' : 'View progress'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function CommissioningStatus({ session }: { session: CommissioningSession }) {
  return (
    <span className="wg:mt-1 wg:text-xs wg:text-primary">
      {commissioningLabel(session.state)}
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
    awaiting_codesys_confirmation: 'Waiting for CODESYS approval',
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
