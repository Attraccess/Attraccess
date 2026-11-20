// The Matter and Thread permission keys as plain strings. No imports, so the frontend bundle can use them too. The
// backend declares them in ./permissions.ts, which also maps every operation to its minimum key.

export const MATTER_DEVICES_READ = 'matter.devices.read' as const;
export const MATTER_DEVICES_MANAGE = 'matter.devices.manage' as const;
export const MATTER_DEVICES_COMMISSION = 'matter.devices.commission' as const;
export const MATTER_DEVICES_COMMAND_DIRECT = 'matter.devices.command-direct' as const;
export const THREAD_NETWORK_READ = 'thread.network.read' as const;
export const THREAD_NETWORK_MANAGE = 'thread.network.manage' as const;

/** Any of these opens the Matter page. */
export const MATTER_PAGE_PERMISSIONS = [MATTER_DEVICES_READ, THREAD_NETWORK_READ] as const;
