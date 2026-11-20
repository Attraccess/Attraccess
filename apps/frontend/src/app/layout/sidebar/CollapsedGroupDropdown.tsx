import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownPopover } from '@heroui/react';
import { ExternalLink } from 'lucide-react';
import { buttonVariants } from '@heroui/styles';
import { useNavigate } from 'react-router-dom';
import React from 'react';

export interface CollapsedGroupDropdownProps {
  label: string;
  icon: React.ReactNode;
  items: { key: string; label: string; icon: React.ReactNode; path: string; isExternal?: boolean }[];
  'data-cy'?: string;
}

// In the collapsed icon rail, accordion groups become icon-triggered dropdowns.
export function CollapsedGroupDropdown({ label, icon, items, ...rest }: CollapsedGroupDropdownProps) {
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
