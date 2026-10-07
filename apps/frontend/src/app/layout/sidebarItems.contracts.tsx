import { LucideProps } from 'lucide-react';

export type SidebarItem = {
  path: string;
  icon: React.FunctionComponent<LucideProps>;
  translationKey?: string;
  isExternal?: boolean;
  isGroup?: false;
  licenseModule?: string;
  badgeCount?: number;
  /** Entry displays the unread-message count. Set on the entry so the badge never keys off a path string. */
  showsUnreadCount?: true;
};

export type SidebarItemGroup = {
  isGroup: true;
  icon: React.FunctionComponent<LucideProps>;
  items: SidebarItem[];
  translationKey: string;
  licenseModule?: string;
};
