export const queryKeys = {
  controllers: ['wago', 'controllers'] as const,
  settings: ['wago', 'settings'] as const,
  mqttServers: ['mqtt', 'servers'] as const,
  draft: (controllerId: number) => ['wago', 'configuration-draft', controllerId] as const,
  presets: ['wago', 'configuration-presets'] as const,
  revisions: (controllerId: number) => ['wago', 'configuration-revisions', controllerId] as const,
  commissioningSessions: ['wago', 'commissioning-sessions'] as const,
};
