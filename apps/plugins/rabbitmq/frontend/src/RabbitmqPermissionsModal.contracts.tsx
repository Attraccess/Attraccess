import type { RabbitmqPermission } from './users-api';
import type { RabbitmqUser } from './users-api';

export interface PermissionRow extends RabbitmqPermission {
  // Rows added via "Add vhost" don't exist on the broker until saved — their
  // remove button only drops the row locally.
  persisted: boolean;
}

export interface RabbitmqPermissionsModalProps {
  mqttServerId: number;
  isOpen: boolean;
  user: RabbitmqUser | null;
  vhosts: string[];
  onClose: () => void;
  // Called after every successful change so the panel reflects the broker.
  onSaved: () => void;
}
