import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { useAddChannelState } from './useAddChannelState';
import { AddChannelChannelsAdd } from './AddChannelChannelsAdd';
/** The wizard holds its own proposal. Nothing enters the working draft until confirmation. */
export function AddChannel({
  snapshot,
  metadata,
  terminal,
  onAdd,
  onCancel,
  onExternal,
}: {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  terminal?: number;
  onAdd: (snapshot: WagoConfigurationSnapshot, metadata: ConfigurationEditorMetadata, selected: string) => void;
  onCancel: () => void;
  onExternal: () => void;
}) {
  const model = useAddChannelState({ snapshot, metadata, terminal, onAdd, onCancel, onExternal });

  return (
    <AddChannelChannelsAdd
      {...{
        t: model.t,
        step: model.step,
        purpose: model.purpose,
        setPurpose: model.setPurpose,
        onExternal,
        name: model.name,
        setName: model.setName,
        direction: model.direction,
        selectedTerminal: model.selectedTerminal,
        terminals: model.terminals,
        setAssignment: model.setAssignment,
        pulseMs: model.pulseMs,
        setPulseMs: model.setPulseMs,
        guardId: model.guardId,
        inputs: model.inputs,
        metadata,
        setGuardId: model.setGuardId,
        disconnect: model.disconnect,
        setDisconnect: model.setDisconnect,
        timeoutMs: model.timeoutMs,
        setTimeoutMs: model.setTimeoutMs,
        onCancel,
        setStep: model.setStep,
        valid: model.valid,
        create: model.create,
      }}
    />
  );
}
