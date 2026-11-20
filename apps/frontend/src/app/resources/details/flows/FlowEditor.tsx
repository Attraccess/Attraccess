import { useMemo } from 'react';
import type { FlowOwner } from './flowOwner';
import { flowOwnerKey } from './flowOwner';
import { FlowProvider } from './context/index';
import { FlowEditorCanvas } from './FlowEditorCanvas';

/** The flow editor for any owner: a resource's own flow or a global flow. */
export function FlowEditor({ owner }: { owner: FlowOwner }) {
  const ownerIdentity = flowOwnerKey(owner);
  // Memoised on the identity: children key their queries and effects on the owner object.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the identity string covers every field of the owner.
  const stableOwner = useMemo(() => owner, [ownerIdentity]);

  return (
    <FlowProvider key={ownerIdentity} owner={stableOwner}>
      <FlowEditorCanvas />
    </FlowProvider>
  );
}
