// Query options shared by the export data queries
// FEATURE: CSV export — no window-focus refetch of a (possibly fully loaded) multi-page export

/**
 * After "Download CSV" fetched every page, refocusing the tab would refetch all of them.
 *
 * The generated infinite hooks type their options as a complete `UseInfiniteQueryOptions`, including
 * the `initialPageParam`/`getNextPageParam` they already set themselves. Typed `never` so this partial
 * override fits that parameter without influencing the hook's inferred data type.
 */
export const EXPORT_QUERY_OPTIONS = { refetchOnWindowFocus: false } as unknown as never;
