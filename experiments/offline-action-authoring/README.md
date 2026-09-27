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

## Prototype evaluation (2026-09-27)

The fixture compares generated action metadata and input/output schema shapes
with snapshots of the existing Hello and Calcu manual representations (Calcu
source snapshot: `SoundBlaster/Calcu` commit `5d1870b68dc172b6e6bb5453d3dde3352d19c4fc`).
These are fixture snapshots, not a live cross-repository synchronization gate.
After normalizing schema identity (`$id`) and TypeBox's redundant
`type: "string"` beside `enum`/`const`, the closed payload shapes match. The
redundant type is accepted but is not byte/shape-identical to the manual schema.
The fixture uses different schema base URIs from the Hello and Calcu baselines.
The test isolates the URI effect and confirms changing only `$id` changes the
input-schema hash; the generated action must not be substituted into an
existing Grant/surface snapshot without rebuilding and re-authorizing the
relevant authority.

Calcu's arithmetic remains an application-owned handler parameter. The
prototype prepares its declaration and validates representations without
calling that binding; it does not duplicate Calcu math or integrate with the
live Calcu executor. Hello likewise remains a fixture-only representation.
This demonstrates local action/schema plumbing reduction, not reduced host
composition or complete manifest/runtime conformance.

The schema checks cover explicit metadata, duplicate IDs, closed root/nested
objects, unsupported keywords, unknown action IDs, the four allowed arithmetic
operators, and rejected extra operators. Array membership is snapshotted by the
catalog, and preparing does not mutate caller-owned declaration values. The
declaration object and TypeBox schemas themselves are still retained by
reference, so callers must not mutate them before preparation; defensive
declaration-value snapshotting remains open. The `Type.Unsafe` enum bridge also
remains a typing limitation: schema runtime values are fixed to the four
operators, but a generic unsafe cast can claim an incompatible TypeScript
type.

Not established by this offline experiment: dangling/conflicting resource
references, declaration/type/schema correspondence in general, automatic
method discovery (there is none), Grant expansion behavior, issuance, consent,
identity, session admission, runtime invocation, receipts, transport, or
application-side-effect guarantees. `JsonDocument` continues to reject
non-finite JSON numbers and negative zero at its input boundary; that is not a
property inferred from TypeBox's number schema.
