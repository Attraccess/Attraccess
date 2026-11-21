import { PostgresBaseline1760000000000 } from './1760000000000-baseline';
import { PostgresGlobalForms1795700000000 } from './1795700000000-global-forms';

/** The released PostgreSQL migration track, in order. Later schema changes are appended here as new migrations. */
export const postgresMigrations = [PostgresBaseline1760000000000, PostgresGlobalForms1795700000000];
