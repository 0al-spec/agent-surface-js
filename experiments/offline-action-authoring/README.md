# Offline action-authoring prototype

This private experiment explores whether an application can declare one
explicit ASP action in TypeScript, derive its closed JSON Schema and static
handler types from the same TypeBox declarations, and validate the resulting
offline fragment with the existing SDK validators.

It is not part of the root SDK export and is not a published package. Its
current scope is only `risk: propose`, `side_effect: false`, and
`approval: none`. Application code supplies the handler explicitly. Preparing
the catalog does not invoke, serialize, discover, or expose that handler.

The experiment does not issue or select Grants, verify identity, collect
consent, create sessions, enforce quotas, admit runtime requests, invoke
handlers, create receipts, or provide a transport. Its validated output is a
static action/schema fragment, not proof that an application enforces those
declarations at runtime.

The current candidate schema authoring dependency is TypeBox 0.34.52. It is
used only by this experiment; the SDK's accepted schema dialect remains
authoritative. In particular, the Calcu operator union is represented using
JSON Schema `enum`, because TypeBox's default enum encoding exceeds the
current bounded validator's supported dialect.

Run from the repository root:

```sh
npm run test:action-authoring-prototype
```

The check builds the experiment, packs both it and the base SDK, installs
those artifacts into an isolated consumer fixture, type-checks the consumer,
and tests Hello and Calcu action/schema fragments without invoking either
application handler.
