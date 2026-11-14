export const MINUTES_PER_HOUR = 60;

// Module-level so useNumberFormatter, which memoises on its options object, keeps one formatter across renders
export const HOURS_FORMAT = { maximumFractionDigits: 1 } as const satisfies Intl.NumberFormatOptions;
