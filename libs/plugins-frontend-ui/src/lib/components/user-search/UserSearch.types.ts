import type { HTMLAttributes } from 'react';
import type { UserIdentity } from '../attraccess-user/AttraccessUser';

export interface UserSearchProps {
  label?: string;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Clears the current selection and search whenever this value changes identity
   * (e.g. pass a drawer's isOpen so the picker resets on every open/close). */
  resetSignal?: unknown;
  onSelectionChange?: (user: UserIdentity | null) => void;
  wrapperProps?: Omit<HTMLAttributes<HTMLDivElement>, 'children'>;
  afterAutocomplete?: React.ReactNode;
  afterSelection?: React.ReactNode;
}
