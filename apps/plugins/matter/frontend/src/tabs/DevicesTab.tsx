import { useParams } from 'react-router-dom';
import { DeviceDetailPage } from '../devices/DeviceDetailPage';
import { DeviceList } from '../devices/DeviceList';

/**
 * Devices: the list at `/matter/devices` and one device at `/matter/devices/:nodeId`, both under the same tab.
 * Visible with `matter.devices.read`; lifecycle actions and name edits need `matter.devices.manage`. Direct commands
 * (`matter.devices.command-direct`) have no UI yet.
 */
export function DevicesTab() {
  const { nodeId } = useParams<{ nodeId: string }>();
  return nodeId ? <DeviceDetailPage nodeId={nodeId} /> : <DeviceList />;
}
