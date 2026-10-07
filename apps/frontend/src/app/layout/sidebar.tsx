import { SidebarProps } from './sidebar.contracts';
import { useSidebarState } from './useSidebarState';
import { SidebarAside } from './SidebarAside';

// In the collapsed icon rail, accordion groups become icon-triggered dropdowns.

export function Sidebar({ isOpen, toggleSidebar, isCollapsed, toggleCollapsed }: SidebarProps) {
  const {
    logout,
    user,
    t,
    language,
    setLanguage,
    navigate,
    theme,
    isSettingsMenuOpen,
    cycleTheme,
    handleSettingsMenuOpenChange,
    defaultGroupItems,
    otherGroups,
    sidebarEndGroups,
    sidebarEndSoloItems,
  } = useSidebarState({ isOpen, toggleSidebar, isCollapsed, toggleCollapsed });

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-backdrop transition-opacity duration-300 md:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={toggleSidebar}
        aria-hidden="true"
        data-cy="sidebar-mobile-backdrop"
      />

      {/* Sidebar */}
      <SidebarAside
        {...{
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
        }}
      />
    </>
  );
}
