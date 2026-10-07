import { type RabbitmqUser } from './users-api';

export interface RabbitmqUserFormModalProps {
  mqttServerId: number;
  isOpen: boolean;
  // The user being edited; null means create.
  user: RabbitmqUser | null;
  // Known vhosts, used as a hint for the default-permissions vhost field.
  vhosts: string[];
  onClose: () => void;
  // Called after a successful save so the panel can reload the list.
  onSaved: () => void;
}
