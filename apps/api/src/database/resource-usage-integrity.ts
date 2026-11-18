// Stable import path for the usage recovery that the released migration 1790100000000 and the lifecycle sweep use.
// The SQL is SQLite's (AUTOINCREMENT, datetime('now'), char(10)), so it lives in the SQLite adapter; another backend
// brings its own implementation behind this same name through its migration track and adapter.
export { USAGE_RECOVERY_TABLE_SQL, recoverOrphanedUsages } from './sqlite/sqlite-usage-recovery';
