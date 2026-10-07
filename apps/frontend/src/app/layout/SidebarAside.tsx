import { SidebarHelpfulLinks } from './SidebarHelpfulLinks';
import { X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  Button,
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionIndicator,
  AccordionPanel,
  AccordionBody,
  Separator,
} from '@heroui/react';
import { Logo } from '../../components/logo';
import { NavLink } from './sidebar.helpers';
import { CollapsedGroupDropdown } from './sidebar.helpers';
import { useSidebarState } from './useSidebarState';
import { SidebarSidebarSettingsDropdown } from './SidebarSidebarSettingsDropdown';
type Props = Pick<
  ReturnType<typeof useSidebarState>,
  | 'isCollapsed'
  | 'isOpen'
  | 't'
  | 'toggleCollapsed'
  | 'toggleSidebar'
  | 'defaultGroupItems'
  | 'otherGroups'
  | 'sidebarEndGroups'
  | 'sidebarEndSoloItems'
  | 'user'
  | 'isSettingsMenuOpen'
  | 'handleSettingsMenuOpenChange'
  | 'setLanguage'
  | 'language'
  | 'navigate'
  | 'cycleTheme'
  | 'theme'
  | 'logout'
>;
export function SidebarAside({
  isCollapsed,
  isOpen,
  t,
  toggleCollapsed,
  toggleSidebar,
  defaultGroupItems,
  otherGroups,
  sidebarEndGroups,
  sidebarEndSoloItems,
  user,
  isSettingsMenuOpen,
  handleSettingsMenuOpenChange,
  setLanguage,
  language,
  navigate,
  cycleTheme,
  theme,
  logout,
}: Props) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 ${isCollapsed ? 'w-16' : 'w-64'} bg-surface border-r border-separator border-t-4 border-t-accent transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } transition-[transform,width] duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col`}
    >
      {/* Sidebar Header */}
      <div className={`flex items-center h-16 ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        {!isCollapsed && <Logo data-cy="sidebar-home-link" />}

        <Button
          variant="ghost"
          aria-label={isCollapsed ? t('expandSidebar') : t('collapseSidebar')}
          isIconOnly
          className="hidden md:inline-flex"
          onPress={toggleCollapsed}
          data-cy="sidebar-collapse-button"
        >
          {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>

        <Button
          variant="ghost"
          aria-label="Close sidebar"
          isIconOnly
          className="md:hidden"
          onPress={toggleSidebar}
          data-cy="sidebar-close-button"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      <Separator />

      {/* Sidebar Navigation */}
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

      <SidebarHelpfulLinks {...{ isCollapsed, sidebarEndGroups, sidebarEndSoloItems, t }} />
      <Separator />

      {/* User section at bottom */}
      <SidebarSidebarSettingsDropdown
        {...{
          isCollapsed,
          user,
          isSettingsMenuOpen,
          handleSettingsMenuOpenChange,
          t,
          setLanguage,
          language,
          navigate,
          cycleTheme,
          theme,
          logout,
        }}
      />
    </aside>
  );
}
