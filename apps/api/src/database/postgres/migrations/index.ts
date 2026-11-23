import { PostgresBaseline1760000000000 } from './1760000000000-baseline';
import { PostgresImportSqlite1760000000001 } from './1760000000001-import-sqlite';
import { PostgresGlobalForms1795700000000 } from './1795700000000-global-forms';
import { PostgresUserNames1796000000000 } from './1796000000000-user-names';
import { AttractapNfcCapability1796100000000 } from './1796100000000-attractap-nfc-capability';
import { AttractapDropBridgeResourceLinks1796100000001 } from './1796100000001-attractap-drop-bridge-resource-links';
import { SessionDurationLimits1796200000000 } from './1796200000000-session-duration-limits';
import { SessionEndingSoonEmailTemplate1796200000001 } from './1796200000001-session-ending-soon-email-template';
import { FormImages1796200000002 } from './1796200000002-form-images';
import { ResourceListVisibility1796300000000 } from './1796300000000-resource-list-visibility';
import { PermittedResourceIndexes1796300000001 } from './1796300000001-permitted-resource-indexes';

/** The released PostgreSQL migration track, in order. Later schema changes are appended here as new migrations. */
export const postgresMigrations = [
  PostgresBaseline1760000000000,
  PostgresImportSqlite1760000000001,
  PostgresGlobalForms1795700000000,
  PostgresUserNames1796000000000,
  AttractapNfcCapability1796100000000,
  AttractapDropBridgeResourceLinks1796100000001,
  SessionDurationLimits1796200000000,
  SessionEndingSoonEmailTemplate1796200000001,
  FormImages1796200000002,
  ResourceListVisibility1796300000000,
  PermittedResourceIndexes1796300000001,
];
