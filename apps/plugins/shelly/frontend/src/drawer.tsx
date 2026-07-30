// Drawer + form primitives shared by the Shelly plugin's drawers.
//
// StandardDrawer mirrors the host's apps/frontend/src/components/standardDrawer.tsx,
// replicated here because host components aren't shared with plugins over module
// federation — only @heroui/react primitives are.
import { Button, DrawerBackdrop, DrawerContent, DrawerDialog, Input, Label, TextField } from '@heroui/react';
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
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <DrawerBackdrop isOpen={isOpen} onOpenChange={onOpenChange}>
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
  type,
  autoComplete = 'off',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  description?: ReactNode;
  dataCy?: string;
  type?: 'text' | 'password';
  autoComplete?: string;
}) {
  return (
    <TextField value={value} onChange={onChange} isRequired={required}>
      <Label>{label}</Label>
      <Input type={type} placeholder={placeholder} autoComplete={autoComplete} data-cy={dataCy} />
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

  return (
    <div className="sh:relative">
      {/* The browser masks the value natively, so `value` is always the real
          password — never a masked stand-in that could be typed back over it. */}
      <TextFieldRow
        label={label}
        value={value}
        onChange={onChange}
        type={visible ? 'text' : 'password'}
        placeholder="enter password"
        required={required}
        description={description}
        dataCy={dataCy}
        autoComplete={autoComplete}
      />
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="sh:absolute sh:right-1 sh:top-6"
        onPress={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOffIcon className="sh:h-4 sh:w-4" /> : <EyeIcon className="sh:h-4 sh:w-4" />}
      </Button>
    </div>
  );
}
