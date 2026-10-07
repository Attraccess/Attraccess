import { ExternalLink } from 'lucide-react';
import { Dropdown } from '@heroui/react';
import { DropdownTrigger } from '@heroui/react';
import { DropdownMenu } from '@heroui/react';
import { DropdownItem } from '@heroui/react';
import { DropdownPopover } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { useNavigate } from 'react-router-dom';
import type { CollapsedGroupDropdownProps } from './sidebar.contracts';
import { Chip } from '@heroui/react';
import { cn } from '@heroui/react';
import { NavLink as RouterNavLink } from 'react-router-dom';
import type { NavLinkProps } from './sidebar.contracts';

export // In the collapsed icon rail, accordion groups become icon-triggered dropdowns.
function CollapsedGroupDropdown({ label, icon, items, ...rest }: CollapsedGroupDropdownProps) {
  const navigate = useNavigate();

  return (
    <Dropdown {...rest}>
      <DropdownTrigger
        aria-label={label}
        className={`${buttonVariants({ variant: 'ghost' })} !flex w-full items-center justify-center px-2 py-2 h-auto`}
      >
        {icon}
      </DropdownTrigger>
      <DropdownPopover placement="right top">
        <DropdownMenu aria-label={label}>
          {items.map((item) => (
            <DropdownItem
              key={item.key}
              id={item.key}
              onPress={() => (item.isExternal ? window.open(item.path, '_blank', 'noreferrer') : navigate(item.path))}
            >
              {item.icon}
              {item.label}
              {item.isExternal ? <ExternalLink className="h-4 w-4" /> : null}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );
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
