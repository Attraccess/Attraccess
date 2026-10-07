import {
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionIndicator,
  AccordionPanel,
  AccordionBody,
} from '@heroui/react';
import { NavLink } from './sidebar.helpers';
import { CollapsedGroupDropdown } from './sidebar.helpers';
import type { useSidebarState } from './useSidebarState';
type Props = Pick<ReturnType<typeof useSidebarState>, 'isCollapsed' | 'sidebarEndGroups' | 'sidebarEndSoloItems' | 't'>;
export function SidebarHelpfulLinks({ isCollapsed, sidebarEndGroups, sidebarEndSoloItems, t }: Props) {
  return (
    <div className="py-4">
      <nav className="px-2 space-y-1">
        {isCollapsed ? (
          sidebarEndGroups.map((group) => (
            <CollapsedGroupDropdown
              key={group.translationKey}
              label={t('endItems.groups.' + group.translationKey + '.label')}
              icon={<group.icon size={16} aria-hidden />}
              data-cy={`sidebar-group-${group.translationKey}`}
              items={group.items.map((item) => ({
                key: item.path,
                path: item.path,
                icon: <item.icon size={16} aria-hidden />,
                label: t('endItems.groups.' + group.translationKey + '.items.' + item.translationKey),
                isExternal: item.isExternal,
              }))}
            />
          ))
        ) : (
          <Accordion>
            {sidebarEndGroups.map((group) => (
              <AccordionItem key={group.translationKey} id={group.translationKey} className="text-sm">
                <AccordionHeading>
                  <AccordionTrigger className="px-2 py-2 text-sm font-normal rounded-md">
                    <span className="flex items-center">
                      <span className="mr-3 flex items-center">
                        <group.icon size={16} aria-hidden />
                      </span>
                      {t('endItems.groups.' + group.translationKey + '.label')}
                    </span>
                    <AccordionIndicator />
                  </AccordionTrigger>
                </AccordionHeading>
                <AccordionPanel>
                  <AccordionBody className="px-0 pt-0 pb-0">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.path}
                        href={item.path}
                        icon={<item.icon size={16} aria-hidden />}
                        label={t('endItems.groups.' + group.translationKey + '.items.' + item.translationKey)}
                        isExternal={item.isExternal}
                        indent
                      />
                    ))}
                  </AccordionBody>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        )}
        {sidebarEndSoloItems.map((item) => (
          <NavLink
            key={item.path}
            href={item.path}
            icon={<item.icon size={16} aria-hidden />}
            label={t('endItems.' + item.translationKey)}
            data-cy={`sidebar-nav-${item.path?.replace('/', '')}`}
            isExternal={item.isExternal}
            collapsed={isCollapsed}
          />
        ))}
      </nav>
    </div>
  );
}
