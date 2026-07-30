// Drawer + form primitives shared by the Shelly plugin's drawers.
//
// StandardDrawer mirrors the host's apps/frontend/src/components/standardDrawer.tsx,
// replicated here because host components aren't shared with plugins over module
// federation — only @heroui/react primitives are.
import { DrawerBackdrop, DrawerContent, DrawerDialog, Input, Label, TextField } from '@heroui/react';
import type { CSSProperties, ReactNode } from 'react';

const DRAWER_DIALOG_CLASSNAME = 'sh:md:max-w-2xl sh:md:mx-auto sh:bg-surface-secondary';
const FIELD_CONTRAST_STYLE: CSSProperties = {
  ['--field-border' as never]: 'var(--border-secondary)',
  ['--border-width-field' as never]: '1px',
};

export function StandardDrawer({
  isOpen,
  onOpenChange,
  label,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Accessible name for the dialog. Our headers render a plain <h2> rather than
   * a HeroUI `<Heading slot="title">`, so react-aria cannot infer a name and
   * warns "a dialog must have a title" — this supplies one explicitly.
   */
  label: string;
  children: ReactNode;
}) {
  return (
    <DrawerBackdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerDialog aria-label={label} className={DRAWER_DIALOG_CLASSNAME} style={FIELD_CONTRAST_STYLE}>
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
