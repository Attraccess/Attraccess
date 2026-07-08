import { ReactNode } from 'react';
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  Separator,
} from '@heroui/react';
import { MoreVerticalIcon } from 'lucide-react';
import { Button } from './button';

export type TableRowActionVariant = 'default' | 'destructive';

export interface TableRowAction {
  key: string;
  label: string;
  icon?: ReactNode;
  variant?: TableRowActionVariant;
  isDisabled?: boolean;
  isPending?: boolean;
  dataCy?: string;
  testId?: string;
  onPress: () => void;
}

interface TableRowActionsProps {
  actions: Array<TableRowAction | false | null | undefined>;
  ariaLabel: string;
  triggerDataCy?: string;
}

function renderAction(action: TableRowAction) {
  const isDestructive = action.variant === 'destructive';

  return (
    <DropdownItem
      key={action.key}
      id={action.key}
      textValue={action.label}
      onPress={action.onPress}
      isDisabled={action.isDisabled || action.isPending}
      data-cy={action.dataCy}
      data-testid={action.testId}
      variant={isDestructive ? 'danger' : undefined}
      className={isDestructive ? 'text-danger' : undefined}
    >
      {action.icon && (
        <span className={isDestructive ? 'inline-flex mr-2 text-danger' : 'inline-flex mr-2 text-muted'}>
          {action.icon}
        </span>
      )}
      {action.label}
    </DropdownItem>
  );
}

export function TableRowActions(props: Readonly<TableRowActionsProps>) {
  const actions = props.actions.filter((action): action is TableRowAction => Boolean(action));
  if (actions.length === 0) return null;

  const regularActions = actions.filter((action) => action.variant !== 'destructive');
  const destructiveActions = actions.filter((action) => action.variant === 'destructive');

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button variant="ghost" isIconOnly aria-label={props.ariaLabel} data-cy={props.triggerDataCy}>
          <MoreVerticalIcon className="w-4 h-4" />
        </Button>
      </DropdownTrigger>
      <DropdownPopover>
        <DropdownMenu aria-label={props.ariaLabel}>
          {regularActions.map(renderAction)}
          {regularActions.length > 0 && destructiveActions.length > 0 && <Separator />}
          {destructiveActions.map(renderAction)}
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );
}
