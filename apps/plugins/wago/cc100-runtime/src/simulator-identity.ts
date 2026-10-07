import { store, type SimulatorState } from './simulator-state';
import { required } from './simulator-settings';

export async function loadSimulatorIdentity() {
  const state = (await store.load()) as SimulatorState;
  const hardwareId = state.simulatorHardwareId ?? required('WAGO_HARDWARE_ID');
  const pairingCode = state.credentials
    ? state.simulatorPairingCode || process.env.WAGO_PAIRING_CODE || ''
    : required('WAGO_PAIRING_CODE');
  if (process.env.WAGO_HARDWARE_ID && process.env.WAGO_HARDWARE_ID !== hardwareId)
    throw new Error('WAGO_HARDWARE_ID does not match the persisted simulator identity');
  if (!hardwareId.trim() || /[/+#]/.test(hardwareId) || hardwareId.includes(String.fromCharCode(0)))
    throw new Error('invalid WAGO_HARDWARE_ID');
  await store.save(Object.assign(state, { simulatorHardwareId: hardwareId, simulatorPairingCode: pairingCode }));
  return { state, hardwareId, pairingCode };
}
