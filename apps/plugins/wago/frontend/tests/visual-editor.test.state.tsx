import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
const state = vi.hoisted(() => ({
  snapshot: {
    version: 1,
    physicalPoints: [{ id: 'point', hardwareProfile: '751-9301', channel: 0 }],
    logicalChannels: [
      {
        id: 'output',
        physicalPointId: 'point',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'immediate' },
      },
    ],
  },
  save: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn(),
  publish: vi.fn(),
  review: vi.fn(),
  history: vi.fn(),
  revisionPreview: vi.fn(),
  getDraft: vi.fn(),
  baseline: vi.fn(),
  rollback: vi.fn(),
  acknowledge: vi.fn(),
  diagnostics: vi.fn(),
  validate: vi.fn(),
}));
vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  getDraft: state.getDraft,
  getConfigurationBaseline: state.baseline,
  listPresets: vi.fn(async () => [
    { id: 'pulsed-lock-bank', name: 'Pulsed lock bank', description: 'Pulse output' },
    { id: 'generic-digital-output', name: 'Generic digital output', description: 'Output' },
  ]),
  listConfigurationRevisions: state.history,
  validateConfiguration: state.validate,
  saveDraft: state.save,
  previewPreset: state.preview,
  applyPreset: state.apply,
  publishConfiguration: state.publish,
  reviewConfiguration: state.review,
  previewConfigurationRevision: state.revisionPreview,
  rollbackConfiguration: state.rollback,
  acknowledgeConfigurationRejection: state.acknowledge,
}));

export { state };
