import { Chip, cn } from '@heroui/react';
import { ExternalLink } from 'lucide-react';
import { NavLink as RouterNavLink } from 'react-router-dom';
import React from 'react';

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

export function NavLink({
  href,
  label,
  icon,
  isExternal,
  target,
  indent,
  badgeCount,
  collapsed,
  ...rest
}: NavLinkProps) {
  const resolvedTarget = target ?? (isExternal ? '_blank' : undefined);
  const paddingClass = indent && !collapsed ? 'pl-6 pr-2' : 'px-2';
  const className = `${
    collapsed ? 'relative justify-center' : ''
  } flex items-center ${paddingClass} py-2.5 rounded-lg border-l-2 border-transparent text-sm text-foreground no-underline hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2`;
  const badge =
    badgeCount && badgeCount > 0 ? (
      collapsed ? (
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" data-cy="sidebar-nav-badge" />
      ) : (
        <Chip color="accent" variant="primary" size="sm" className="ml-2 shrink-0" data-cy="sidebar-nav-badge">
          {badgeCount > 99 ? '99+' : badgeCount}
        </Chip>
      )
    ) : null;

  if (isExternal) {
    return (
      <a
        {...rest}
        href={href}
        target={resolvedTarget}
        rel={resolvedTarget === '_blank' ? 'noreferrer' : undefined}
        className={className}
        title={collapsed ? label : undefined}
      >
        <span className={collapsed ? '' : 'mr-3'}>{icon}</span>
        {!collapsed && <span className="flex-1">{label}</span>}
        {!collapsed && <ExternalLink className="ml-2 mr-2 h-4 w-4" />}
      </a>
    );
  }

  return (
    <RouterNavLink
      {...rest}
      to={href}
      target={resolvedTarget}
      className={({ isActive }) =>
        cn(
          className,
          isActive &&
            'border-l-accent bg-accent-soft text-accent-soft-foreground font-semibold hover:bg-accent-soft-hover',
        )
      }
      title={collapsed ? label : undefined}
    >
      <span className={collapsed ? '' : 'mr-3'}>{icon}</span>
      {!collapsed && <span className="flex-1">{label}</span>}
      {badge}
    </RouterNavLink>
  );
}
