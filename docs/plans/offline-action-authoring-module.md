# Optional offline action authoring module

Status: proposed design, 2026-10-02 UTC. No new exports, implemented signatures,
source-lock update, live migration or certification claim are established here.
Delivery status stays in the upstream adoption backlog; this is a design slice,
not a second tracker. Follow the [API principles](../api-design-principles.md)
and [responsibility scope](../architecture.md#sdk-responsibility-scope).

## Decision and evidence

Recommend qualifying a small optional offline authoring entry point before a
live Calcu description migration. Keep the base SDK provider-neutral and keep
business handlers out of the first authoring module.

[Calcu PR #15](https://github.com/SoundBlaster/Calcu/pull/15), merged as
`f4dfe28548a5871806313b0dd957776e27743bfb`, demonstrated a complete offline
candidate at two issuer namespaces using application-owned metadata. Its
[report](https://github.com/SoundBlaster/Calcu/blob/f4dfe28548a5871806313b0dd957776e27743bfb/docs/OFFLINE_ACTION_AUTHORING.md)
records matching payload shapes and the added operator `type: string` keyword.
That keyword changes input-schema and surface hashes. It is not a transparent
replacement of the production manifest.

The private [prototype](../../experiments/offline-action-authoring/README.md)
already supplies bounded schema preparation and immutable descriptors. Do not
build a second schema engine. The experiment demonstrates shared input/output
fields and inferred types, not a measured reduction of total host setup.

## Application-first use case

An application already has an arithmetic function. The integrator declares its
input/output shape and explicit ASP metadata once. Authoring prepares the
action document and schema resources. The host supplies the remaining manifest
fields and validates the complete selected contract. A separately provisioned
executor binds the existing function and admits every invocation independently.

```text
Application-owned schema + explicit ASP metadata + data-class catalog
    -> explicit offline preparation
    -> immutable action documents + schema resources + shape validators
    -> host-owned manifest composition + complete contract validation

Existing application handler + independently admitting executor
    -> future trusted runtime binding (not supplied by authoring)
```

Preparing or adding an action creates no Grant, session, consent, endpoint or
tool exposure. Native application functions remain usable without ASP.

## Selected module boundary

Proposed entry point: `@0al/agent-surface/authoring`, not a new repository or
another language for configuration. The spelling and class names remain
provisional until implementation/consumer tests qualify them. Nothing is
re-exported from the base entry point as part of this design.

| Input owned by the integrator | Prepared offline result | Not supplied |
| --- | --- | --- |
| Explicit `id`, `scope`, `risk`, `side_effect`, `approval`, `execution`, `data_exposure` | ASP action document with schema references and exact input-schema hash | Inferred risk, effects, scopes, classifications or authority |
| Closed supported input/output schemas | Schema resources and shape validation | Business correctness or natural-language intent verification |
| Application data-class catalog and schema base URI | Checked references, unique IDs/URIs and bounded resource closure | Full manifest defaults, issuer, credentials, identity, storage or transport |

The authoring module accepts no handler, holds no handler closure and exposes
no `run`, `invoke`, dispatch handle or automatic method discovery. This is a
deliberate change from the private prototype, which captures but never invokes
its handler. The prototype has no discovered handler bypass; this removal
narrows unnecessary coupling rather than repairs an observed vulnerability.
Inferred input/output types remain available for application-owned
bindings. Typed binding to an admitting executor belongs to a later composition
slice; schema validation alone cannot qualify that execution path.

No domain math, Codex model/CLI settings, prompts, UI or retention probes enter
this module. Root SDK consumers must not need TypeBox merely to import the base
package. Qualify separate exports and an optional peer dependency in packed
consumer tests before claiming dependency isolation.

## First supported contract

- Explicit proposal metadata only: `risk: propose`, `side_effect: false`,
  `approval: none`, `execution.mode: propose`, `persisted: false`, explicit
  `operation_id`. No safe defaults silently fill security metadata.
- Start with the proven TypeBox `0.34.52` authoring model. Do not introduce a
  custom builder DSL, YAML loader, decorators or generator framework. Preserve
  ordinary JSON Schema as the wire representation. Supporting a different
  authoring library/version requires its own compatibility evidence.
- First grammar: closed required-field objects, number fields,
  string fields and plain string literals/string-literal unions. Every nested
  object is closed. Reject unsupported keywords and symbol metadata; no
  `Type.Unsafe` escape hatch. Compile-time casts do not establish compatibility.
  Optional fields, arrays, references, recursive schemas, general unions, custom formats and
  transformations are outside this first grammar. Existing base wire validators
  retain their separately documented broader bounded subset.
- Preparation captures caller data without mutation; schema validation,
  lowering and hashing are explicit behavior, not constructor I/O. Reject
  accessors, cycles and unsupported graphs with bounded work. Developer inputs
  are trusted code/data: this is not a sandbox against Proxy traps or plugins.
- Reuse `OfflineSchemaResources`, `DataClassCatalog`, `DataExposure`,
  `JsonDocument` and the pinned ASP hash implementation. Resolve only the
  supplied resource set, never the network or filesystem. Preserve existing
  resource/complexity limits; fragments do not bypass aggregate limits.
- Only inventory-level preparation is a public qualification boundary. It must
  validate the complete selected resource set atomically before returning the
  prepared result. Keep the prototype's individual fragment generation internal:
  its current `prepare()` computes a descriptor but does not establish resource
  readiness. Do not publish it with the same apparent readiness guarantee as
  catalog or full-manifest preparation.
- Prepared documents/resources are immutable. Validate untrusted JSON from raw
  source through `JsonDocument`; do not erase invalid values or duplicate keys
  with an earlier `JSON.parse`/`JSON.stringify` round trip. Schema validity
  does not replace Calcu's numeric or arithmetic business rules.

The supported fragment inventory may contain several explicit proposal actions
within existing resource limits. This does **not** expand the current complete
manifest contract: `OfflineProposalManifest` accepts exactly one action and one
scope. A multi-action fragment check is not full multi-action conformance.
Do not relax that validator merely to make an authoring example work.

## Output and compatibility rules

Keep protocol field names and hash domains unchanged. The first qualified
generator retains the prototype's string-enum output including `type: string`;
do not remove keywords merely to reuse the old Calcu hash. Golden fixtures pin
schema resources, URI rules, action documents and hashes. The ordering of
actions and enum members is explicit and preserved; JCS object-key ordering
does not make array ordering irrelevant.

Changes to the selected generator or authoring inputs must be evaluated against
those fixtures and the complete consumer contract. Accepted-value equivalence
alone is insufficient to reuse schema/surface authority bindings. New public
ASP fields or a new protocol profile are not needed for a SDK authoring module.
The existing `spec-lock.json` remains pinned; a future upstream compatibility
update is a separate reviewed task.

For a later Calcu live switch, rebuild the complete manifest and snapshot,
review the new version/hash and require fresh authority/consent/session
transitions where the selected contract requires them. Old bindings must fail
at the independent executor. No dual-hash acceptance, implicit Grant expansion
or automatic reissuance is introduced by authoring. The live switch is not
authorized by accepting this design document.

## Qualification plan

1. Extract one supported authoring entry point from the experiment, remove
   handler capture and document its exact grammar/error categories. Do not
   alter base exports or the source lock. Test mutation/capture/limit failures.
2. Qualify packed consumers: base import without TypeBox; selected authoring
   with the pinned peer; Calcu and a small non-arithmetic proposal declaration.
   Validate both descriptors and compile-time type correspondence. Neither
   fixture demonstrates live interoperability.
3. Replace Calcu's private offline candidate dependency with the qualified
   entry point. Keep production authority untouched; compare full manifests,
   exact hashes and remaining per-action versus host-owned setup separately.
4. Only after those results, propose the live description migration and the
   separately scoped admitting-executor binding. Do not extract all host roles
   or introduce a general adapter framework in this slice.

## Acceptance matrix

| Area | Required evidence |
| --- | --- |
| Deterministic preparation | Golden schema/action/hash results at two namespaces, explicit array ordering, repeated preparation with unchanged inputs |
| Metadata and closure | Unknown metadata/classes, duplicate IDs/URIs, dangling/conflicting refs and unavailable supplied resources reject; no external resolution |
| Shape and type | Calcu's four operators and another domain compile/validate; extra fields, `sqrt`, wrong types and unsupported schema constructs reject |
| Snapshot and bounds | Caller mutation cannot rewrite captured declarations; accessors/cycles, excessive size/depth and aggregate inventory fail closed |
| No executable authority | Handler-bearing declarations reject, prepared result has no execution handle, native application code is not called by preparation |
| Packaging | Actual npm-pack consumers exercise authoring exports; root import/typecheck works without the optional schema peer |
| Complete contract | Calcu host/event/receipt/identity fields remain explicit; one-action full manifest validates, unsupported multi-action composition fails |
| Later migration fence | Before any live switch, old hash/Grant/session bindings reject and admission failures call no handler; this is a later gate, not an offline passing claim |

Successful delivery means a supported bounded description authoring module,
not a supported issuer, executor, transport, multi-action profile or production
deployment. Record any second-consumer limitations instead of generalizing
from two fixtures to all applications.
