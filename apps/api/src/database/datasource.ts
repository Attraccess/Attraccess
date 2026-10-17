import { selectDatabaseBackend } from './backend.registry';

// Historical TypeORM CLI entry. Selection is shared with application startup.
const backend = selectDatabaseBackend();
export const dataSourceConfig = backend.connectionOptions();
export default backend.createConnection();
