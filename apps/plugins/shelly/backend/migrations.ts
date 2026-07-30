// Plugin migrations entry — bundled to dist/migrations.js and declared as
// `main.migrations` in plugin.json. The host loads this module independently of
// the backend entry and runs the exported migration classes through its
// plugin-scoped migration runner (up on boot, down on uninstall).
//
// Export migration classes as named exports, mirroring the host's
// migrations/index.ts. See docs/en/plugins/database-migrations.md.
export * from './migrations/1749470400000-create-shelly-devices';
export * from './migrations/1749470500000-add-zigbee-support';
