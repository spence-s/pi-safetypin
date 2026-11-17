/**
 * Allows deeply nested configuration overrides without requiring complete objects.
 *
 * @remarks
 * For types extending `Record<string, unknown>`, every property becomes optional
 * and its value is recursively transformed. Each property also explicitly accepts
 * `undefined`, so callers can assign it even with `exactOptionalPropertyTypes`
 * enabled; an optional property alone would only permit omitting the property.
 *
 * Arrays and readonly arrays become mutable arrays of recursively transformed
 * elements. Tuple lengths and readonly array modifiers are not preserved. Array
 * elements do not gain `undefined` unless their original type already includes it.
 *
 * Other types, including primitives and types that do not extend the record
 * constraint, are left unchanged. Conditional types distribute over unions, so
 * each union member is transformed independently. This is a compile-time type
 * only: it neither validates nor changes configuration values at runtime.
 *
 * @typeParam T - The complete type from which partial configuration is derived.
 */
export type PartialWithUndefined<T> = T extends ReadonlyArray<infer Item>
  ? Array<PartialWithUndefined<Item>>
  : T extends Record<string, unknown>
    ? {[Key in keyof T]?: PartialWithUndefined<T[Key]> | undefined}
    : T;
