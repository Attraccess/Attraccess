// Maps physical terminals and devices into editable controller configuration snapshots.
// FEATURE: WAGO front panel configuration preserves applied channel routing identities.
export { type PanelConfiguration } from './model.contracts';
export { type Terminal } from './model.contracts';
export { type Channel } from './model.contracts';
export { DEFAULT_BUS } from './model.default-bus';
export { terminalChannel } from './model.save-device.helpers';
export { terminalName } from './model.save-device.helpers';
export { updateTerminal } from './model.update-terminal';
export { busConnection } from './model.add-device.helpers';
export { updateBus } from './model.save-device.helpers';
export { addDevice } from './model.add-device.helpers';
export { saveDevice } from './model.save-device.helpers';
export { removeDevice } from './model.add-device.helpers';
export { deviceProfile } from './model.add-device.helpers';
export { registerChannel } from './model.add-device.helpers';
