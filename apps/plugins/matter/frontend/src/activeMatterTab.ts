import { activeRoutedTab } from '@attraccess/plugins-frontend-ui';
import { MATTER_BASE_PATH } from './matterPaths';
import type { MatterTab } from './matterTabs';

/** The visible tab the path belongs to; `/matter/devices/<id>` belongs to Devices. Undefined: redirect. */
export const activeMatterTab = (visible: readonly MatterTab[], pathname: string): MatterTab | undefined =>
  activeRoutedTab(visible, MATTER_BASE_PATH, pathname);
