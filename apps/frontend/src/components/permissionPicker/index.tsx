import { PermissionPickerAutocomplete } from './PermissionPickerAutocomplete';
import { PermissionPickerDrawerField } from './PermissionPickerDrawerField';
import type { PermissionPickerProps } from './permissionPickerTypes';

export type { PermissionPickerProps } from './permissionPickerTypes';

export function PermissionPicker(props: Readonly<PermissionPickerProps>) {
  return props.presentation === 'drawer' ? (
    <PermissionPickerDrawerField {...props} />
  ) : (
    <PermissionPickerAutocomplete {...props} />
  );
}
