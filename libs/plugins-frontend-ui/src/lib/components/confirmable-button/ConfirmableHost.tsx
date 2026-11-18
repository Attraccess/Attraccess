// Hosts the dialogs of ConfirmableButtons whose activator unmounts, such as dropdown menu items
// FEATURE: confirmations triggered from menus survive the menu closing
import { ReactNode, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { ConfirmableHostContext, ConfirmableRequest } from './ConfirmableHostContext';

/**
 * Wrap content that unmounts when used (a dropdown menu) and render the host where it stays mounted.
 * Every ConfirmableButton inside opens its dialog here instead of in itself.
 */
export function ConfirmableHost({ children }: Readonly<{ children: ReactNode }>) {
  const [request, setRequest] = useState<ConfirmableRequest>();
  const [isOpen, setIsOpen] = useState(false);

  const open = (next: ConfirmableRequest) => {
    setRequest(next);
    setIsOpen(true);
  };

  return (
    <ConfirmableHostContext value={open}>
      {children}
      <ConfirmDialog request={request} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </ConfirmableHostContext>
  );
}
