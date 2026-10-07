import type { CommissioningSession } from './api';
export const DEFAULT_SSH = { username: 'root', password: 'wago' };

export const session: CommissioningSession = {
  id: 7,
  hardwareId: 'test-controller',
  mqttServerId: 1,
  targetHost: '192.0.2.7',
  controllerName: 'Test controller',
  hostKeyFingerprint: 'SHA256:test',
  firmwareBaseline: '31',
  state: 'awaiting_delivery',
  enrollmentExpiresAt: null,
  codesysState: null,
  progressPercent: 0,
  progressStep: null,
  progressDetail: null,
  auditLog: '[]',
  failureReason: null,
  createdAt: '',
  updatedAt: '',
};
