import { Menu } from 'lucide-react';
import { Button } from '@heroui/react';
import { Logo } from '../../components/logo';

interface HeaderProps {
  toggleSidebar: () => void;
}

export function Header({ toggleSidebar }: HeaderProps) {
  return (
    <header className="bg-white dark:bg-gray-800 shadow-xs h-16 flex items-center justify-between px-4 md:hidden">
      <Button variant="ghost"
        aria-label="Menu"
        isIconOnly
        onPress={toggleSidebar}
        className="focus:outline-none"
        data-cy="header-menu-button"
      >
        <Menu className="h-6 w-6" />
      </Button>
      <Logo />
      <div className="w-6" aria-hidden="true" />
    </header>
  );
}
