// The URLs of the Matter page. A leaf module (no components), so tabs can link to each other without an import cycle.
export const MATTER_BASE_PATH = '/matter';

export type MatterTabKey = 'devices' | 'infrastructure' | 'thread' | 'commissioning' | 'health' | 'updates';

/** The URL segment of each tab below `/matter`. */
export const MATTER_TAB_SEGMENTS: Record<MatterTabKey, string> = {
  devices: 'devices',
  infrastructure: 'infrastructure',
  thread: 'thread',
  commissioning: 'commissioning',
  health: 'health',
  updates: 'updates',
};

export const matterTabPath = (key: MatterTabKey): string => `${MATTER_BASE_PATH}/${MATTER_TAB_SEGMENTS[key]}`;

export const matterDevicePath = (nodeId: string): string => `${matterTabPath('devices')}/${encodeURIComponent(nodeId)}`;

/** Every route of the page: the base (redirects to the first allowed tab), the tabs and one device. */
export const MATTER_ROUTE_PATHS: readonly string[] = [
  MATTER_BASE_PATH,
  ...Object.values(MATTER_TAB_SEGMENTS).map((segment) => `${MATTER_BASE_PATH}/${segment}`),
  `${matterTabPath('devices')}/:nodeId`,
];
