// The tabs of the Matter page: one entry each, in display order. A tab's content is one self-contained component
// (./tabs/*), so a later ticket replaces that file and never touches the layout.
import { ActivityIcon, BoxesIcon, DownloadCloudIcon, NetworkIcon, PlusCircleIcon, ServerCogIcon } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { MATTER_TAB_SEGMENTS, type MatterTabKey } from './matterPaths';
import type { MatterPermissions } from './permissions';
import { CommissioningTab } from './tabs/CommissioningTab';
import { DevicesTab } from './tabs/DevicesTab';
import { HealthTab } from './tabs/HealthTab';
import { InfrastructureTab } from './tabs/InfrastructureTab';
import { ThreadTab } from './tabs/ThreadTab';
import { UpdatesTab } from './tabs/UpdatesTab';

export interface MatterTab {
  key: MatterTabKey;
  /** The URL segment below `/matter`. */
  path: string;
  icon: ReactNode;
  /** Who sees the tab. Actions inside it check their own permission. */
  isVisible: (permissions: MatterPermissions) => boolean;
  Content: ComponentType;
}

const icon = (Icon: typeof BoxesIcon) => <Icon className="mt:h-4 mt:w-4" />;

export const MATTER_TABS: readonly MatterTab[] = [
  { key: 'devices', path: MATTER_TAB_SEGMENTS.devices, icon: icon(BoxesIcon), isVisible: (p) => p.canRead, Content: DevicesTab },
  {
    key: 'infrastructure',
    path: MATTER_TAB_SEGMENTS.infrastructure,
    icon: icon(ServerCogIcon),
    isVisible: (p) => p.canRead,
    Content: InfrastructureTab,
  },
  { key: 'thread', path: MATTER_TAB_SEGMENTS.thread, icon: icon(NetworkIcon), isVisible: (p) => p.canReadThread, Content: ThreadTab },
  {
    key: 'commissioning',
    path: MATTER_TAB_SEGMENTS.commissioning,
    icon: icon(PlusCircleIcon),
    isVisible: (p) => p.canCommission,
    Content: CommissioningTab,
  },
  {
    key: 'health',
    path: MATTER_TAB_SEGMENTS.health,
    icon: icon(ActivityIcon),
    isVisible: (p) => p.canRead || p.canReadThread,
    Content: HealthTab,
  },
  {
    key: 'updates',
    path: MATTER_TAB_SEGMENTS.updates,
    icon: icon(DownloadCloudIcon),
    isVisible: (p) => p.canRead,
    Content: UpdatesTab,
  },
];
