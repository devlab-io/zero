// apps/mail type boundary for `@zero/server/auth` (issue devlab-io/zero#43).
//
// apps/mail imports the `Auth` *type* only (apps/mail/lib/auth-client.ts, to derive
// `Session = Awaited<ReturnType<Auth['api']['getSession']>>`). Importing it from the
// real `lib/auth.ts` drags the whole server graph (createAuth -> env/driver/db -> …)
// into apps/mail's tsc program. This self-contained declaration exposes the minimal,
// leaf surface of `Auth` that apps/mail consumes: `api.getSession`, returning the
// better-auth session shape produced by this app's config (standard fields + the
// `phoneNumber` plugin fields). It has NO imports, so it cuts the graph.
//
// Faithfulness is enforced by a drift type-test (src/lib/auth.boundary.test-d.ts) that
// asserts the real `createAuth().api.getSession` return type is assignable to the shape
// below — if better-auth's session shape ever narrows away a field declared here, the
// server typecheck fails. Resolved for apps/mail via a tsconfig `paths` redirect; the
// server itself always uses the real `lib/auth.ts`. See docs/adr/0006-trpc-type-boundary.md.

export type BoundarySessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean | null;
};

export type BoundarySession = {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type Auth = {
  api: {
    getSession: (
      ...args: never[]
    ) => Promise<{ session: BoundarySession; user: BoundarySessionUser } | null>;
  };
};
