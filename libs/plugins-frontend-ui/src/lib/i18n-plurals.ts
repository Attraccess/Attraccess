// Pluralization helpers
export interface PluralObject {
  one: string;
  many: string;
}

export const isPluralObject = (value: unknown): value is PluralObject => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'one' in value &&
    'many' in value &&
    typeof (value as Record<string, unknown>).one === 'string' &&
    typeof (value as Record<string, unknown>).many === 'string'
  );
};

export const resolvePlural = (value: PluralObject, count: number): string => {
  return count === 1 ? value.one : value.many;
};
