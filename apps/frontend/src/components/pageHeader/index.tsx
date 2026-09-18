import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, cn } from '@heroui/react';
import { PageAction, PageHeaderActions } from './actions';

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
}: Readonly<PageHeaderProps>) {
  const navigate = useNavigate();

  const hasActions = !!actions && actions.some((a) => !a.isHidden);

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

      {hasActions && (
        <div className="flex items-center gap-2 flex-wrap">
          <PageHeaderActions
            actions={actions as PageAction[]}
            maxVisible={maxVisibleActions}
            moreLabel={moreActionsLabel}
          />
        </div>
      )}
    </div>
  );
}
