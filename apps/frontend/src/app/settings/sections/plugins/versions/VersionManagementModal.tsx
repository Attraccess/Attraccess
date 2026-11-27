import { StandardModal } from '@attraccess/plugins-frontend-ui';
import { useState } from 'react';
import { useIsDesktop } from '../../../../../hooks/useIsDesktop';
import type { VersionPlugin } from '../types';
import { VersionManagementContent } from './VersionManagementContent';

interface Props {
  /** The installed package to manage; the dialog is open while this is set. */
  plugin: VersionPlugin | null;
  onClose: () => void;
}

/** On a phone the dialog fills the screen: its body scrolls and the footer actions stay in view. */
export function VersionManagementModal({ plugin, onClose }: Props) {
  const [isReplacing, setIsReplacing] = useState(false);
  const isDesktop = useIsDesktop();
  return (
    <StandardModal
      isOpen={plugin !== null}
      onOpenChange={(open) => !open && !isReplacing && onClose()}
      data-cy="plugins-list-version-management-modal"
      size={isDesktop ? 'lg' : 'full'}
    >
      {({ close }) =>
        plugin ? (
          <VersionManagementContent
            plugin={plugin}
            isReplacing={isReplacing}
            onReplacingChange={setIsReplacing}
            onClose={onClose}
            onCancel={close}
          />
        ) : null
      }
    </StandardModal>
  );
}
