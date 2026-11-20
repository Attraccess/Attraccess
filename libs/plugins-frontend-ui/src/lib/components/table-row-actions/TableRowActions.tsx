// Row actions of a table: an icon-only ⋮ trigger opening a sectioned dropdown menu
// FEATURE: one row action pattern for every table in core and plugins
import { ComponentType, Fragment, ReactNode, useRef } from 'react';
import {
  cn,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownSection,
  DropdownTrigger,
  Header,
  Label,
  Separator,
  Spinner,
} from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { MoreVerticalIcon } from 'lucide-react';
import { useTranslations } from '../../i18n';
import {
  ConfirmableButton,
  ConfirmableConfirmOptions,
  ConfirmableHost,
  ConfirmableStatus,
} from '../confirmable-button';
import en from './en.json';
import de from './de.json';

export type TableRowActionTone = 'default' | 'danger';

export interface TableRowAction {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** `danger` marks destructive actions: red, and in their own last section unless `section` is set. */
  tone?: TableRowActionTone;
  /** Key of a section from `sections`; without it, actions go to the regular or the destructive section. */
  section?: string;
  isDisabled?: boolean;
  isHidden?: boolean;
  /** Disables the item and shows a spinner instead of its icon. */
  isPending?: boolean;
  /** The action; with `confirm`, it runs after the user confirms. */
  onPress?: () => unknown;
  href?: string;
  /**
   * Asks for confirmation first; status defaults to `error` for danger actions, `warning` otherwise.
   * An action with `confirm` runs `onPress` after confirming and never follows `href`.
   */
  confirm?: ConfirmableConfirmOptions & { status?: ConfirmableStatus };
  'data-cy'?: string;
}

export interface TableRowActionSection {
  key: string;
  title?: ReactNode;
}

interface TableRowActionsProps {
  actions: TableRowAction[];
  /** Names the row in the trigger's label: "Actions for {{name}}". */
  itemName?: string;
  /** Named sections, in display order, between the regular and the destructive section. */
  sections?: TableRowActionSection[];
  /** Shows a spinner on the trigger, e.g. while a row-wide operation runs. */
  isPending?: boolean;
  'data-cy'?: string;
}

/** How long after the menu or its confirmation closed focus falling back is still moved to the trigger. */
const REFOCUS_WINDOW_MS = 1000;

/**
 * When the menu or its confirmation closes, the table grid moves focus to the trigger's cell or row (or
 * it ends up on the page body), where Enter would run the row action instead of reopening the menu. For a
 * short while, put focus that falls back there onto the trigger again; focus the user moves elsewhere
 * is left alone.
 */
function keepFocusOnTrigger(wrapper: HTMLElement | null) {
  const trigger = wrapper?.querySelector('button');
  if (!trigger) return;
  const fellBack = (target: EventTarget | null) =>
    target === document.body || (target instanceof Node && target !== trigger && target.contains(trigger));
  const refocus = (event?: FocusEvent) => {
    if (trigger.isConnected && fellBack(event ? event.target : document.activeElement)) trigger.focus();
  };
  document.addEventListener('focusin', refocus);
  window.setTimeout(() => {
    document.removeEventListener('focusin', refocus);
    refocus();
  }, REFOCUS_WINDOW_MS);
  refocus();
}

const REGULAR = '__regular';
const DESTRUCTIVE = '__destructive';

function groupActions(actions: TableRowAction[], sections: TableRowActionSection[]) {
  const order = [REGULAR, ...sections.map((section) => section.key), DESTRUCTIVE];
  const groups = new Map<string, TableRowAction[]>(order.map((key) => [key, []]));
  for (const action of actions) {
    const key = action.section ?? (action.tone === 'danger' ? DESTRUCTIVE : REGULAR);
    groups.get(key)?.push(action);
  }
  return order
    .map((key) => ({
      key,
      title: sections.find((section) => section.key === key)?.title,
      actions: groups.get(key) ?? [],
    }))
    .filter((group) => group.actions.length > 0);
}

function ActionItem({ action, onAction }: Readonly<{ action: TableRowAction; onAction?: () => unknown }>) {
  const Icon = action.icon;
  const isDanger = action.tone === 'danger';
  const iconClassName = cn('size-4 shrink-0', isDanger ? 'text-danger' : 'text-muted');
  return (
    <DropdownItem
      id={action.key}
      textValue={action.label}
      variant={isDanger ? 'danger' : 'default'}
      href={action.href}
      onAction={onAction}
      isDisabled={action.isDisabled || action.isPending}
      data-cy={action['data-cy']}
    >
      {action.isPending ? (
        <Spinner size="sm" color="current" className={iconClassName} />
      ) : (
        <Icon className={iconClassName} />
      )}
      <Label>{action.label}</Label>
    </DropdownItem>
  );
}

function renderAction(action: TableRowAction) {
  if (!action.confirm) return <ActionItem key={action.key} action={action} onAction={action.onPress} />;
  const { status, ...confirm } = action.confirm;
  return (
    <ConfirmableButton
      key={action.key}
      label={action.label}
      status={status ?? (action.tone === 'danger' ? 'error' : 'warning')}
      confirm={confirm}
      onConfirm={() => action.onPress?.()}
      // Without the href, choosing the item only opens the confirmation instead of navigating straight away.
      renderActivator={(open) => <ActionItem action={{ ...action, href: undefined }} onAction={open} />}
    />
  );
}

export function TableRowActions(props: Readonly<TableRowActionsProps>) {
  const { actions, itemName, sections = [], isPending } = props;
  // React escapes the label; escaping it here too would put `&amp;` into a name like `A & B`.
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const visible = actions.filter((action) => !action.isHidden);
  if (visible.length === 0) return null;

  const label = itemName ? t('triggerFor', { name: itemName }) : t('trigger');
  const groups = groupActions(visible, sections);

  return (
    <ConfirmableHost onClose={() => keepFocusOnTrigger(wrapperRef.current)}>
      {/* Centred in its cell, below the centred TableActionsColumnHeader. */}
      <div ref={wrapperRef} className="flex justify-center">
        <Dropdown onOpenChange={(isOpen) => !isOpen && keepFocusOnTrigger(wrapperRef.current)}>
          {/* HeroUI's .dropdown__trigger is inline-block; re-assert the button's centering. */}
          <DropdownTrigger
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm', isIconOnly: true }),
              'inline-flex items-center justify-center',
            )}
            aria-label={label}
            isDisabled={isPending}
            data-cy={props['data-cy']}
          >
            {isPending ? <Spinner size="sm" color="current" /> : <MoreVerticalIcon className="size-4" />}
          </DropdownTrigger>
          <DropdownPopover placement="bottom end">
            <DropdownMenu aria-label={label}>
              {groups.map((group, index) => (
                <Fragment key={group.key}>
                  {index > 0 && <Separator />}
                  <DropdownSection
                    id={group.key}
                    aria-label={typeof group.title === 'string' ? group.title : undefined}
                  >
                    {group.title !== undefined && <Header>{group.title}</Header>}
                    {group.actions.map(renderAction)}
                  </DropdownSection>
                </Fragment>
              ))}
            </DropdownMenu>
          </DropdownPopover>
        </Dropdown>
      </div>
    </ConfirmableHost>
  );
}
