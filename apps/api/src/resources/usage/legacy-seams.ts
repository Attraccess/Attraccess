/**
 * Features outside the usage area (billing, maintenance, plugin events, reader hooks) still declare the ORM entities
 * of users and resources in their signatures. The records usage hands them are the very rows they would have read
 * themselves, so the neutral view is passed on as the type they ask for. Each use disappears when the receiving
 * feature takes neutral models.
 */
export function asLegacy<T>(record: object): T {
  return record as T;
}
