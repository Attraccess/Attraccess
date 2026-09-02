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
import type { WagoController } from './api';

interface ControllersTableProps {
  controllers: WagoController[];
  onClaim: (controllerId: number) => void;
  onConfigure: (controllerId: number) => void;
}

export function ControllersTable({ controllers, onClaim, onConfigure }: ControllersTableProps) {
  return (
    <Table>
      <TableScrollContainer>
        <TableContent aria-label="WAGO controllers">
          <TableHeader>
            <TableColumn isRowHeader>Controller</TableColumn>
            <TableColumn>Trust</TableColumn>
            <TableColumn>Connection</TableColumn>
            <TableColumn className="wg:hidden wg:md:table-cell">Runtime</TableColumn>
            <TableColumn className="wg:hidden wg:lg:table-cell">Last heartbeat</TableColumn>
            <TableColumn className="wg:text-end">Actions</TableColumn>
          </TableHeader>
          <TableBody items={controllers} renderEmptyState={EmptyControllers}>
            {(controller) => (
              <TableRow key={controller.id} id={controller.id}>
                <TableCell>
                  <div className="wg:flex wg:flex-col">
                    <span className="wg:font-medium">{controller.name ?? controller.hardwareId}</span>
                    <span className="wg:text-xs wg:text-muted">{controller.hardwareId}</span>
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
                <TableCell className="wg:hidden wg:lg:table-cell">
                  {formatHeartbeat(controller.lastHeartbeatAt)}
                </TableCell>
                <TableCell>
                  {controller.trustState === 'untrusted' && (
                    <Button size="sm" onPress={() => onClaim(controller.id)}>
                      Claim
                    </Button>
                  )}
                  {controller.trustState === 'claimed' && (
                    <Button size="sm" variant="secondary" onPress={() => onConfigure(controller.id)}>
                      Configure
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}

function EmptyControllers() {
  return (
    <div className="wg:px-4 wg:py-12 wg:text-center wg:text-sm wg:text-muted">
      No controllers have connected yet. Commission a controller, then wait for it to connect.
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

function formatHeartbeat(lastHeartbeatAt: string | null): string {
  return lastHeartbeatAt ? new Date(lastHeartbeatAt).toLocaleString() : 'Never';
}
