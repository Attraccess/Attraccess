// Plugin migrations entry — bundled to dist/migrations.js and declared as
// `main.migrations` in plugin.json. Export migration classes as named exports.
export * from './migrations/1790000000000-create-reservations';
export * from './migrations/1790000000001-add-reservation-status-indexes';
export * from './migrations/1790000000002-add-show-names-on-readers';
