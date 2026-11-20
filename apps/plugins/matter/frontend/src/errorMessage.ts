/** The text of a failed request (or anything else thrown) as the page shows it. */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
