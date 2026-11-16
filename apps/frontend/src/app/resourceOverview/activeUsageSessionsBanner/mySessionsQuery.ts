import { UseResourcesServiceGetAllResourcesKeyFn } from '@attraccess/react-query-client';

export const ACTIVE_RESOURCES_PAGE_SIZE = 50;

/** The resources where the signed-in user runs a session: the banner's list and the dashboard's "My sessions". */
export const MY_SESSIONS_QUERY = { onlyInUseByMe: true, limit: ACTIVE_RESOURCES_PAGE_SIZE, page: 1 } as const;

export const mySessionsQueryKey = () => UseResourcesServiceGetAllResourcesKeyFn(MY_SESSIONS_QUERY);
