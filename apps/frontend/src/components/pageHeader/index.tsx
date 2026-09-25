import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, cn } from '@heroui/react';
import { PageAction, PageHeaderActions } from './actions';
import { DashboardPinToggle } from '../../app/dashboard/pins';
import { SIDEBAR_ITEMS } from '../../app/layout/sidebarItems';
import usePluginState from '../../app/plugins/plugin.state';

export type {
  PageAction,
  PageActionPress,
  PageActionRender,
  PageActionTriggerProps,
  PageActionVariant,
} from './actions';
export { PageHeaderActions } from './actions';

interface PageHeaderProps {
  title: string | ReactNode;
  subtitle?: string | ReactNode;
  backTo?: string;
  onBack?: () => void;
  actions?: PageAction[];
  maxVisibleActions?: number;
  moreActionsLabel?: string;
  icon?: ReactNode;
  noMargin?: boolean;
  thumbnailSrc?: string;
  thumbnailAlt?: string;
  dashboardPin?: { path: string; label: string; itemType?: 'page' | 'resource' };
}

export function PageHeader({
  title,
  subtitle,
  backTo,
  onBack,
  actions,
  maxVisibleActions,
  moreActionsLabel,
  icon,
  noMargin,
  thumbnailSrc,
  thumbnailAlt,
  dashboardPin,
}: Readonly<PageHeaderProps>) {
  const navigate = useNavigate();
  const location = useLocation();
  const { plugins } = usePluginState();

  const hasActions = !!actions && actions.some((a) => !a.isHidden);
  const dashboardEntry = [...SIDEBAR_ITEMS.flatMap((item) => 'items' in item ? item.items : [item]), ...['/dependencies', '/changelog', '/printables'].map((path) => ({ path, isExternal: false }))]
    .find((item) => item.path === location.pathname && !item.isExternal && item.path !== '/dashboard');
  const pluginEntry = plugins.flatMap((manifest) => {
    try { return manifest.plugin.getSidebarItems?.() ?? []; } catch { return []; }
  }).find((item) => item.path === location.pathname);
  const pin = dashboardPin ?? (dashboardEntry ? { path: dashboardEntry.path, label: typeof title === 'string' ? title : dashboardEntry.path } : pluginEntry ? { path: pluginEntry.path, label: typeof title === 'string' ? title : pluginEntry.label } : undefined);

  return (
    <div className={cn('flex items-center w-full justify-between mb-8 flex-wrap gap-4', noMargin && 'mb-0')}>
      <div className="flex items-center min-w-0">
        {(backTo || onBack) && (
          <Button
            variant="ghost"
            onPress={() => (backTo ? navigate(backTo) : onBack?.())}
            isIconOnly
            aria-label="Go back"
            className="mr-4"
            data-cy="back-button"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
        )}
        <div className="flex-shrink flex flex-col">
          {(icon || thumbnailSrc) && (
            <div className="mr-2">
              {icon}
              {thumbnailSrc && (
                <img
                  className="object-contain rounded-lg"
                  height={48}
                  width={48}
                  src={thumbnailSrc}
                  alt={thumbnailAlt}
                />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-start gap-2 ">
            <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
          </div>

          {subtitle &&
            (typeof subtitle === 'string' ? (
              <p className="mt-1 text-sm text-muted">{subtitle}</p>
            ) : (
              <div className="mt-1 text-sm text-muted">{subtitle}</div>
            ))}
        </div>
      </div>

      {(hasActions || pin) && (
        <div className="flex items-center gap-2 flex-wrap">
          {hasActions && <PageHeaderActions
            actions={actions as PageAction[]}
            maxVisible={maxVisibleActions}
            moreLabel={moreActionsLabel}
          />}
          {pin && <DashboardPinToggle itemType={pin.itemType ?? 'page'} itemId={pin.path} label={pin.label} />}
        </div>
      )}
    </div>
  );
}
