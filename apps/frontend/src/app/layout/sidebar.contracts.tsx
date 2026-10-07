import React from 'react';

export interface CollapsedGroupDropdownProps {
  label: string;
  icon: React.ReactNode;
  items: { key: string; label: string; icon: React.ReactNode; path: string; isExternal?: boolean }[];
  'data-cy'?: string;
}

export interface NavLinkProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  isExternal?: boolean;
  target?: string;
  indent?: boolean;
  badgeCount?: number;
  collapsed?: boolean;
  'data-cy'?: string;
}

export interface NavigationGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavLinkProps[];
}
export interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
}
