import { ReactNode } from 'react';
import { Card, CardContent } from '@heroui/react';

type Accent = 'default' | 'success' | 'warning';

const accentBorder: Record<Accent, string> = {
  default: '',
  success: 'border-l-4 border-l-success',
  warning: 'border-l-4 border-l-warning',
};

interface Props {
  icon?: ReactNode;
  title: string;
  count?: number;
  accent?: Accent;
  action?: ReactNode;
  children: ReactNode;
}

export function SectionCard(props: Props) {
  const { icon, title, count, accent = 'default', action, children } = props;

  return (
    <Card className={accentBorder[accent]}>
      <div className="flex items-center gap-2 px-4 pt-4">
        {icon}
        <h2 className="text-sm uppercase tracking-wide font-semibold text-default-700">{title}</h2>
        {typeof count === 'number' && count > 0 && (
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-default-200 text-default-700 text-xs font-medium">
            {count}
          </span>
        )}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}
