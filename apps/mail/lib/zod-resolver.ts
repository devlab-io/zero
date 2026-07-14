import { zodResolver as zodResolverBase } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { ZodType, infer as ZodInfer } from 'zod';

/**
 * zodResolver bridge for react-hook-form.
 *
 * `@hookform/resolvers@4.1.2` (the pinned version) predates zod@4 support — that
 * landed in resolvers v5. Its `zodResolver` types the schema parameter as the
 * v3-shaped `z.ZodSchema<T, any, any>`, to which a zod@4 `ZodObject` is no longer
 * assignable, producing a TS2345 at every `useForm({ resolver: zodResolver(...) })`
 * call site. This wrapper reconciles the generics ONLY: it forwards the schema to
 * the library resolver unchanged, so runtime validation behaviour is identical.
 *
 * Remove this shim (and switch imports back to `@hookform/resolvers/zod`) once the
 * resolvers dependency is bumped to a zod@4-aware release.
 */
export function zodResolver<Schema extends ZodType<FieldValues>>(
  schema: Schema,
): Resolver<ZodInfer<Schema>> {
  // Double assertion through `unknown`: zod@4 and the v3-shaped parameter type of
  // resolvers@4.1.2 do not structurally overlap, so a direct cast is rejected.
  return zodResolverBase(
    schema as unknown as Parameters<typeof zodResolverBase>[0],
  ) as Resolver<ZodInfer<Schema>>;
}
