import {
  Button,
  ButtonGroup,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
} from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { ChevronDown } from 'lucide-react';

interface SplitActionOption {
  id: string;
  label: string;
  onPress: () => void;
}

interface SplitActionButtonProps {
  label: string;
  menuLabel: string;
  onPress: () => void;
  options: SplitActionOption[];
  isPending?: boolean;
  isDisabled?: boolean;
  dataCy?: string;
}

export function SplitActionButton({
  label,
  menuLabel,
  onPress,
  options,
  isPending = false,
  isDisabled = false,
  dataCy,
}: SplitActionButtonProps) {
  return (
    <ButtonGroup>
      <Button variant="primary" onPress={onPress} isPending={isPending} isDisabled={isDisabled} data-cy={dataCy}>
        {label}
      </Button>
      <Dropdown>
        <DropdownTrigger
          aria-label={menuLabel}
          isDisabled={isPending || isDisabled}
          className={`${buttonVariants({ variant: 'primary', isIconOnly: true })} inline-flex items-center justify-center`}
        >
          <ChevronDown size={18} />
        </DropdownTrigger>
        <DropdownPopover>
          <DropdownMenu aria-label={menuLabel}>
            {options.map((option) => (
              <DropdownItem key={option.id} id={option.id} onPress={option.onPress}>
                {option.label}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </DropdownPopover>
      </Dropdown>
    </ButtonGroup>
  );
}
