import { throwApiErrors } from './api-error';
import { client } from './lib/requests/client.gen';

export * from './lib/requests';
export * from './lib/requests/schemas.gen';
export * from './lib/queries';
export * from './lib/queries/infiniteQueries';
export * from './api-error';
export { client } from './lib/requests/client.gen';

// v1 of the generated client threw an ApiError (with status and body) for every failed request; keep that contract.
throwApiErrors(client);
