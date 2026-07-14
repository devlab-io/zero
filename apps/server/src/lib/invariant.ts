/**
 * Asserts a condition and narrows it to truthy for the rest of the scope.
 *
 * Replaces silent non-null assertions (`x!`) at sites where a value is a real
 * runtime invariant the type system cannot see: on the impossible path this
 * throws an explicit, message-carrying error instead of propagating `undefined`.
 * Use it only where the happy path guarantees the value; where absence is a
 * tolerated state, narrow (early-return / conditional) instead of asserting.
 */
export function invariant(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? 'Invariant failed');
  }
}
