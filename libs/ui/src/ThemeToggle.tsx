import { Button } from '@heroui/react';
import { Moon, Sun } from 'lucide-react';
import { useAppTheme } from './Providers';

export interface ThemeToggleProps {
  label: string;
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ label, className, showLabel = false }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useAppTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      type="button"
      variant="ghost"
      isIconOnly={!showLabel}
      aria-label={label}
      aria-pressed={isDark}
      className={className}
      onPress={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
      {showLabel && label}
    </Button>
  );
}
