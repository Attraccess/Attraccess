import { PostgresBaseline1760000000000 } from './1760000000000-baseline';
import { PostgresImportSqlite1760000000001 } from './1760000000001-import-sqlite';
import { PostgresGlobalForms1795700000000 } from './1795700000000-global-forms';
import { PostgresUserNames1796000000000 } from './1796000000000-user-names';
import { AttractapNfcCapability1796100000000 } from './1796100000000-attractap-nfc-capability';
import { AttractapDropBridgeResourceLinks1796100000001 } from './1796100000001-attractap-drop-bridge-resource-links';
import { SessionDurationLimits1796200000000 } from './1796200000000-session-duration-limits';
import { SessionEndingSoonEmailTemplate1796200000001 } from './1796200000001-session-ending-soon-email-template';
import { FormImages1796200000002 } from './1796200000002-form-images';
import { RoleNetworkActions1796200000003 } from './1796200000003-role-network-actions';
import { ResourceListVisibility1796300000000 } from './1796300000000-resource-list-visibility';
import { PermittedResourceIndexes1796300000001 } from './1796300000001-permitted-resource-indexes';
import { NfcCardType1796300000002 } from './1796300000002-nfc-card-type';
import { AttractapSecureConversion1796300000003 } from './1796300000003-attractap-secure-conversion';
import { BillingTransactionReferenceIndexes1796400000000 } from './1796400000000-billing-transaction-reference-indexes';
import { DiscardZeroUsageBills1796400000001 } from './1796400000001-discard-zero-usage-bills';
import { ResourceMeterArchive1796400000002 } from './1796400000002-resource-meter-archive';
import { ResourceMaintenanceCheck1796500000000 } from './1796500000000-resource-maintenance-check';
import { NfcCardUniqueUid1796500000100 } from './1796500000100-nfc-card-unique-uid';

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
  RoleNetworkActions1796200000003,
  ResourceListVisibility1796300000000,
  PermittedResourceIndexes1796300000001,
  NfcCardType1796300000002,
  AttractapSecureConversion1796300000003,
  BillingTransactionReferenceIndexes1796400000000,
  DiscardZeroUsageBills1796400000001,
  ResourceMeterArchive1796400000002,
  ResourceMaintenanceCheck1796500000000,
  NfcCardUniqueUid1796500000100,
];
