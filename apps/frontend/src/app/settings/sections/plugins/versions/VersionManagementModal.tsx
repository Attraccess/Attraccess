import { StandardModal } from '@attraccess/plugins-frontend-ui';
import { useState } from 'react';
import type { VersionPlugin } from '../types';
import { VersionManagementContent } from './VersionManagementContent';

interface Props {
  /** The installed package to manage; the dialog is open while this is set. */
  plugin: VersionPlugin | null;
  onClose: () => void;
}

export function VersionManagementModal({ plugin, onClose }: Props) {
  const [isReplacing, setIsReplacing] = useState(false);
  return (
    <StandardModal
      isOpen={plugin !== null}
      onOpenChange={(open) => !open && !isReplacing && onClose()}
      data-cy="plugins-list-version-management-modal"
      size="lg"
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
