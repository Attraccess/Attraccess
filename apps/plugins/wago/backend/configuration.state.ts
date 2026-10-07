export const CAPABILITIES = ['output', 'input', 'measurement', 'pulse', 'guard', 'feedback'] as const;
export const CHANNEL_PROFILES = [
  'metered-switched-load',
  'pulsed-lock-bank',
  'guarded-enable-request',
  'generic-digital-output',
  'generic-monitored-input',
] as const;
export const WAGO_PRESETS = [
  {
    id: 'metered-switched-load',
    name: 'Metered switched load',
    description: 'Switches an output off immediately when disconnected and reports a transformed measurement.',
  },
  {
    id: 'pulsed-lock-bank',
    name: 'Pulsed lock bank',
    description: 'Pulses an output briefly and returns it to off immediately when disconnected.',
  },
  {
    id: 'guarded-enable-request',
    name: 'Guarded enable request',
    description: 'Makes a non-safety enable request only while an operational guard is satisfied.',
  },
  { id: 'generic-digital-output', name: 'Generic digital output', description: 'A conservative output foundation.' },
  {
    id: 'generic-monitored-input',
    name: 'Generic monitored input',
    description: 'A monitored digital input foundation.',
  },
] as const;
