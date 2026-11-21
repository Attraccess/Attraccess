import { Transform } from 'class-transformer';

/**
 * Keeps the value exactly as sent. The global implicit conversion would otherwise turn the string "false" (or "yes")
 * into true before `@IsBoolean()` sees it.
 */
export const rawValue = () => Transform(({ obj, key }) => obj[key], { toClassOnly: true });
