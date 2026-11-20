import {
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionIndicator,
  AccordionPanel,
  AccordionBody,
} from '@heroui/react';
import { CollapsedGroupDropdown } from './CollapsedGroupDropdown';
import { NavLink } from './NavLink';
import { useSidebarNavigationGroups } from './useSidebarNavigationGroups';

interface SidebarNavigationProps {
  isCollapsed: boolean;
}

export function SidebarNavigation({ isCollapsed }: SidebarNavigationProps) {
  const { defaultGroupItems, otherGroups } = useSidebarNavigationGroups();

  return (
    <div className="flex-grow overflow-y-auto py-4">
      <nav className="px-2 space-y-1">
        {(defaultGroupItems ?? []).map((item) => (
          <NavLink key={item.href} {...item} collapsed={isCollapsed} />
        ))}
        {isCollapsed ? (
          otherGroups.map((group) => (
            <CollapsedGroupDropdown
              key={group.id}
              label={group.label}
              icon={group.icon}
              data-cy={`sidebar-group-${group.id}`}
              items={group.items.map((item) => ({
                key: item.href,
                path: item.href,
                icon: item.icon,
                label: item.label,
                isExternal: item.isExternal,
              }))}
            />
          ))
        ) : (
          <Accordion>
            {otherGroups.map((group) => (
              <AccordionItem key={group.id} id={group.id}>
                <AccordionHeading>
                  <AccordionTrigger className="px-2 py-2 text-sm font-normal rounded-md">
                    <span className="flex items-center">
                      <span className="mr-3 flex items-center">{group.icon}</span>
                      {group.label}
                    </span>
                    <AccordionIndicator />
                  </AccordionTrigger>
                </AccordionHeading>
                <AccordionPanel>
                  <AccordionBody className="px-0 pt-0 pb-0">
                    {group.items.map((item) => (
                      <NavLink key={item.href} {...item} indent />
                    ))}
                  </AccordionBody>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </nav>
    </div>
  );
}
