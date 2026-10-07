import { image } from './wago-runtime-artifacts.spec.image';

export const manifest = {
  schemaVersion: 1,
  runtime: 'attraccess-wago-cc100',
  runtimeVersion: '0.1.0',
  protocolVersion: '1.0.0',
  image,
  hardware: {
    model: '751-9301',
    platform: 'linux/arm/v7',
    firmwareBaseline: '31',
    profile: 'cc100-751-9301-fw31-digital-v1',
  },
};
