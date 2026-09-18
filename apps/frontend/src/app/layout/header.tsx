import { Menu } from 'lucide-react';
import { Button } from '@heroui/react';
import { Logo } from '../../components/logo';
import { ThemeToggle } from '../../components/themeToggle';

interface HeaderProps {
  toggleSidebar: () => void;
}

export function Header({ toggleSidebar }: HeaderProps) {
  return (
    <header className="bg-surface border-b border-separator border-t-4 border-t-accent h-16 shrink-0 flex items-center justify-between px-4 md:hidden">
      <Button variant="ghost" aria-label="Menu" isIconOnly onPress={toggleSidebar} data-cy="header-menu-button">
        <Menu className="h-6 w-6" />
      </Button>
      <Logo />
      <ThemeToggle />
    </header>
  );
}
