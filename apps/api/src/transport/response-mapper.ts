export interface ResponseModel<T extends object = object> {
  new (): T;
  readonly responseFields: ResponseFields;
}

/** A null selector copies a scalar or validated JSON value; a constructor projects a nested record. */
export type ResponseFields = Readonly<Record<string, null | (() => ResponseModel)>>;

/**
 * Only explicitly reviewed fields cross the transport boundary. Missing relations remain omitted,
 * null values stay null, and dates and exact numeric representations are not coerced.
 */
export function mapResponse<T extends object>(model: ResponseModel<T>, value: object): T;
export function mapResponse<T extends object>(model: ResponseModel<T>, value: null): null;
export function mapResponse<T extends object>(model: ResponseModel<T>, value: undefined): undefined;
export function mapResponse<T extends object>(
  model: ResponseModel<T>,
  value: object | null | undefined,
): T | null | undefined;
export function mapResponse<T extends object>(
  model: ResponseModel<T>,
  value: object | null | undefined,
): T | null | undefined {
  const seen = new WeakMap<object, Map<ResponseModel, object>>();
  const project = (target: ResponseModel, input: object | null | undefined): object | null | undefined => {
    if (input == null) return input;
    const existing = seen.get(input)?.get(target);
    if (existing) return existing;
    const output = new target();
    const projections = seen.get(input) ?? new Map<ResponseModel, object>();
    projections.set(target, output);
    seen.set(input, projections);
    for (const [key, relation] of Object.entries(target.responseFields)) {
      if (!(key in input)) continue;
      const field = Reflect.get(input, key);
      const projected =
        relation && field != null
          ? Array.isArray(field)
            ? field.map((item) => project(relation(), item))
            : project(relation(), field)
          : field;
      Reflect.set(output, key, projected);
    }
    return output;
  };
  return project(model, value) as T | null | undefined;
}
