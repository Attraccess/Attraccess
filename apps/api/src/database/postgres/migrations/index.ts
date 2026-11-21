import { PostgresBaseline1760000000000 } from './1760000000000-baseline';
import { PostgresImportSqlite1760000000001 } from './1760000000001-import-sqlite';
import { PostgresGlobalForms1795700000000 } from './1795700000000-global-forms';
import { PostgresUserNames1796000000000 } from './1796000000000-user-names';
import { AttractapNfcCapability1795800000000 } from './1795800000000-attractap-nfc-capability';
import { AttractapDropBridgeResourceLinks1795800000001 } from './1795800000001-attractap-drop-bridge-resource-links';

/** The released PostgreSQL migration track, in order. Later schema changes are appended here as new migrations. */
export const postgresMigrations = [
  PostgresBaseline1760000000000,
  PostgresImportSqlite1760000000001,
  PostgresGlobalForms1795700000000,
  PostgresUserNames1796000000000,
  AttractapNfcCapability1795800000000,
  AttractapDropBridgeResourceLinks1795800000001,
];
