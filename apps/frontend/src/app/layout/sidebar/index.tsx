import { X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button, Separator } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Logo } from '../../../components/logo/index';
import de from '../sidebar.de.json';
import en from '../sidebar.en.json';
import { HelpfulLinks } from './HelpfulLinks';
import { SettingsMenu } from './SettingsMenu';
import { SidebarNavigation } from './SidebarNavigation';

export interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
}

export function Sidebar({ isOpen, toggleSidebar, isCollapsed, toggleCollapsed }: SidebarProps) {
  const { t } = useTranslations({ en, de });

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
      <aside
        data-sidebar={isCollapsed ? 'collapsed' : 'expanded'}
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

        <SidebarNavigation isCollapsed={isCollapsed} />

        <HelpfulLinks isCollapsed={isCollapsed} />
        <Separator />

        {/* User section at bottom */}
        <SettingsMenu isCollapsed={isCollapsed} />
      </aside>
    </>
  );
}
