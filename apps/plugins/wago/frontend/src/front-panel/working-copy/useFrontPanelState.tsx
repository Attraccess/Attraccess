import { useState } from 'react';
import { useWagoTranslations } from '../../i18n';
import { useFrontPanel } from './useFrontPanel';
import type { Selection } from '../FrontPanel';

export function useFrontPanelState({
  controllerId,
  onClose,
  onHistory,
}: {
  controllerId: number;
  onClose: () => void;
  onHistory: () => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  const panel = useFrontPanel(controllerId);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const closeSettings = () => setSelection(null);
  const navigate = (action: () => void) => (panel.dirty ? setLeave(() => action) : action());
  const device =
    selection?.kind === 'device'
      ? (selection.provisional ?? panel.configuration)?.snapshot.modbus?.devices.find(
          (device) => device.id === selection.id,
        )
      : undefined;
  const manualCount = panel.diagnostics.data?.manualOutputChannelIds?.length ?? 0;
  return {
    t,
    tBackendMessage,
    panel,
    selection,
    setSelection,
    leave,
    setLeave,
    closeSettings,
    navigate,
    device,
    manualCount,
    controllerId,
    onClose,
    onHistory,
  } as const;
}
