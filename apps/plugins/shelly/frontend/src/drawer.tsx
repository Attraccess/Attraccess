// Drawer + form primitives shared by the Shelly plugin's drawers.
//
// StandardDrawer mirrors the host's apps/frontend/src/components/standardDrawer.tsx,
// replicated here because host components aren't shared with plugins over module
// federation — only @heroui/react primitives are.
import {
  Button,
  Description,
  DrawerBackdrop,
  DrawerContent,
  DrawerDialog,
  Input,
  InputGroup,
  Label,
  TextField,
  Tooltip,
} from '@heroui/react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';

const DRAWER_DIALOG_CLASSNAME = 'sh:md:max-w-2xl sh:md:mx-auto sh:bg-surface-secondary';
const FIELD_CONTRAST_STYLE: CSSProperties = {
  ['--field-border' as never]: 'var(--border-secondary)',
  ['--border-width-field' as never]: '1px',
};

export function StandardDrawer({
  isOpen,
  onOpenChange,
  isDismissable = true,
  isKeyboardDismissDisabled = false,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <DrawerBackdrop
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={isKeyboardDismissDisabled}
    >
      <DrawerContent>
        <DrawerDialog className={DRAWER_DIALOG_CLASSNAME} style={FIELD_CONTRAST_STYLE}>
          {children}
        </DrawerDialog>
      </DrawerContent>
    </DrawerBackdrop>
  );
}

export function TextFieldRow({
  label,
  value,
  onChange,
  placeholder,
  required,
  description,
  dataCy,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  description?: ReactNode;
  dataCy?: string;
}) {
  return (
    <TextField value={value} onChange={onChange} isRequired={required}>
      <Label>{label}</Label>
      <Input placeholder={placeholder} autoComplete="off" data-cy={dataCy} />
      {description && <p className="sh:mt-1 sh:text-xs sh:text-muted">{description}</p>}
    </TextField>
  );
}

export function PasswordFieldRow({
  label,
  value,
  onChange,
  description,
  required,
  dataCy,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  description?: string;
  required?: boolean;
  dataCy?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? 'Hide password' : 'Show password';

  // Masking is the browser's job via input[type=password]. Never derive the
  // displayed value from `value` — a controlled input that rewrites its own
  // value accumulates the mask characters into the source of truth.
  return (
    <TextField value={value} onChange={onChange} isRequired={required}>
      <Label>{label}</Label>
      <InputGroup>
        <InputGroup.Input type={visible ? 'text' : 'password'} autoComplete={autoComplete} data-cy={dataCy} />
        <InputGroup.Suffix>
          <Tooltip>
            <Tooltip.Trigger>
              <Button isIconOnly variant="ghost" aria-label={toggleLabel} onPress={() => setVisible((v) => !v)}>
                {visible ? <EyeOffIcon className="sh:h-4 sh:w-4" /> : <EyeIcon className="sh:h-4 sh:w-4" />}
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{toggleLabel}</Tooltip.Content>
          </Tooltip>
        </InputGroup.Suffix>
      </InputGroup>
      {description && <Description>{description}</Description>}
    </TextField>
  );
}
