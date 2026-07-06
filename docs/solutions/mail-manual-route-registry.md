# Mail manual route registry

## Symptom

Adding a route directory such as:

```text
apps/mail/app/(routes)/queue/
```

does not automatically mount `/queue`. The files can exist and typecheck, but
the route remains unreachable in the mail app.

## Root Cause

The mail app uses a manual React Router registry, not purely file-based routing.
The registry must be updated explicitly.

Relevant path:

- `apps/mail/app/routes.ts`

This was confirmed during tartine queue-view: the original plan allowed the
route directory but missed `routes.ts`, so the orchestrator issued a narrow
boundary amendment for an isolated `/queue` registration line.

## Fix

When adding a mail route, create the route files and register the route in:

```text
apps/mail/app/routes.ts
```

Follow the existing route-entry pattern and keep the diff additive. For tartine,
the only approved registry edit was the isolated `/queue` mount; unrelated route
changes stayed out of scope.
