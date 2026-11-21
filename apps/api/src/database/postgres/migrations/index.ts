import { PostgresBaseline1760000000000 } from './1760000000000-baseline';
import { AttractapNfcCapability1795700000000 } from './1795700000000-attractap-nfc-capability';
import { AttractapDropBridgeResourceLinks1795700000001 } from './1795700000001-attractap-drop-bridge-resource-links';

/** The released PostgreSQL migration track, in order. Later schema changes are appended here as new migrations. */
export const postgresMigrations = [
  PostgresBaseline1760000000000,
  AttractapNfcCapability1795700000000,
  AttractapDropBridgeResourceLinks1795700000001,
];
