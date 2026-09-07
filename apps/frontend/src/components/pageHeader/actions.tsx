import { ReactNode } from 'react';
import { cn, Dropdown, DropdownItem, DropdownMenu, DropdownPopover, DropdownTrigger } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { Button } from '../button';
import { MoreVerticalIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

export type PageActionVariant = 'primary' | 'secondary' | 'destructive';

interface PageActionBase {
  key: string;
  label: string;
  icon?: ReactNode;
  variant?: PageActionVariant;
  isDisabled?: boolean;
  isPending?: boolean;
  isHidden?: boolean;
  isIconOnly?: boolean;
  dataCy?: string;
}

export interface PageActionTriggerProps {
  variant: 'primary' | 'outline';
  size: 'sm';
  isDisabled?: boolean;
  isPending?: boolean;
  isIconOnly?: boolean;
  'aria-label': string;
  'data-cy'?: string;
  children: ReactNode;
}

export interface PageActionPress extends PageActionBase {
  onPress: () => void;
  renderTrigger?: undefined;
}

export interface PageActionRender extends PageActionBase {
  renderTrigger: (triggerProps: PageActionTriggerProps) => ReactNode;
  onPress?: undefined;
}

export type PageAction = PageActionPress | PageActionRender;

interface PageHeaderActionsProps {
  actions: PageAction[];
  maxVisible?: number;
  moreLabel?: string;
}

const DEFAULT_MAX_VISIBLE = 6;

function buildTriggerProps(action: PageAction): PageActionTriggerProps {
  return {
    variant: action.variant === 'primary' ? 'primary' : 'outline',
    size: 'sm',
    isDisabled: action.isDisabled,
    isPending: action.isPending,
    isIconOnly: action.isIconOnly,
    'aria-label': action.label,
    'data-cy': action.dataCy,
    children: action.isIconOnly ? (
      action.icon
    ) : (
      <>
        {action.icon}
        {action.label}
      </>
    ),
  };
}

function renderInlineAction(action: PageAction) {
  const triggerProps = buildTriggerProps(action);

  if ('renderTrigger' in action && action.renderTrigger) {
    return <span key={action.key}>{action.renderTrigger(triggerProps)}</span>;
  }

  return <Button key={action.key} {...triggerProps} onPress={(action as PageActionPress).onPress} />;
}

function renderOverflowItem(action: PageActionPress) {
  return (
    <DropdownItem
      key={action.key}
      id={action.key}
      onPress={action.onPress}
      isDisabled={action.isDisabled || action.isPending}
      data-cy={action.dataCy}
      className={action.variant === 'destructive' ? 'text-danger' : undefined}
    >
      {action.icon && <span className="inline-flex mr-2">{action.icon}</span>}
      {action.label}
    </DropdownItem>
  );
}

export function PageHeaderActions({ actions, maxVisible = DEFAULT_MAX_VISIBLE, moreLabel }: PageHeaderActionsProps) {
  const { t } = useTranslations({
    en: { more: 'More actions' },
    de: { more: 'Weitere Aktionen' },
  });

  const visibleActions = actions.filter((a) => !a.isHidden);
  if (visibleActions.length === 0) return null;

  const destructive = visibleActions.filter((a): a is PageActionPress => a.variant === 'destructive' && 'onPress' in a);
  const nonDestructive = visibleActions.filter((a) => a.variant !== 'destructive');

  const lockedCount = nonDestructive.filter((a) => 'renderTrigger' in a && a.renderTrigger).length;
  const overflowBudget = destructive.length > 0 ? (maxVisible === 0 ? 0 : Math.max(1, maxVisible - 1)) : maxVisible;
  const collapsibleSlots = Math.max(0, overflowBudget - lockedCount);

  const inline: PageAction[] = [];
  const overflowExtras: PageActionPress[] = [];
  let collapsibleUsed = 0;
  for (const action of nonDestructive) {
    const isRender = 'renderTrigger' in action && action.renderTrigger;
    if (isRender) {
      inline.push(action);
    } else if (collapsibleUsed < collapsibleSlots) {
      inline.push(action);
      collapsibleUsed += 1;
    } else {
      overflowExtras.push(action as PageActionPress);
    }
  }

  const overflowItems = [...overflowExtras, ...destructive];
  const hasOverflow = overflowItems.length > 0;
  const triggerLabel = moreLabel ?? t('more');

  return (
    <>
      {inline.map(renderInlineAction)}
      {hasOverflow && (
        <Dropdown>
          {/* HeroUI's .dropdown__trigger sets display:inline-block, which beats the
              inline-flex from .button and leaves the icon stuck at the left edge.
              Re-assert the centering as utilities, which do win. */}
          <DropdownTrigger
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm', isIconOnly: true }),
              'inline-flex items-center justify-center',
            )}
            aria-label={triggerLabel}
            data-cy="page-header-overflow-trigger"
          >
            <MoreVerticalIcon className="w-4 h-4" />
          </DropdownTrigger>
          <DropdownPopover>
            <DropdownMenu aria-label={triggerLabel}>{overflowItems.map(renderOverflowItem)}</DropdownMenu>
          </DropdownPopover>
        </Dropdown>
      )}
    </>
  );
}
