# Optional offline action authoring module

Status: accepted design baseline, 2026-10-02 UTC. The first extraction and packed
consumer qualification are implemented in the [optional authoring module](../offline-action-authoring.md).
Calcu consumer migration, live activation and certification remain outside this
slice; the source lock is unchanged.
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

Implemented entry point: `@0al/agent-surface/authoring`, not a new repository or
another language for configuration. `OfflineActionInventory` is the qualified
inventory boundary; nothing is re-exported from the base entry point.

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
Inferred input/output types remain available for application-owned bindings.
Existing application types may instead remain independent, with compile-time
correspondence checked at the integration boundary; do not require native code
to depend on authoring merely to declare a type once. Typed binding to an
admitting executor belongs to a later composition slice; schema validation
alone cannot qualify that execution path.

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
- Use the closed TypeBox grammar below, not arbitrary `TSchema`. Optional
  fields, arrays, references, recursive schemas, general unions, custom formats
  and transformations are outside this first grammar. Existing base wire
  validators retain their separately documented broader bounded subset.
- Reuse `OfflineSchemaResources`, `DataClassCatalog`, `DataExposure`,
  `JsonDocument` and the pinned ASP hash implementation. Resolve only the
  supplied resource set, never the network or filesystem. Preserve existing
  resource/complexity limits; fragments do not bypass aggregate limits.
- One public inventory object accepts typed declaration data and provides
  explicit `prepare(schemaBaseUri)` behavior; separate public definition and
  catalog lifecycle objects are unnecessary. Only inventory-level preparation
  is a public qualification boundary. It must
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
This finite inventory requires no registration hooks or plugin framework.

### Closed TypeBox grammar

Input and output roots are objects. Each schema node must have exactly one own
symbol-keyed data property: `Symbol.for('TypeBox.Kind')`, with the corresponding
value below. Inspect symbol keys and property descriptors before lowering or
JSON serialization; serialization would silently discard unsupported symbols.

| Kind | Allowed own string keys and shape |
| --- | --- |
| `Object` | `type: object`, `properties`, `additionalProperties: false`, `required` listing every property exactly once. Only an empty object may omit `required`; `[]` is also accepted there. |
| `Number` | `type: number` |
| `String` | `type: string` |
| `Literal` | `type: string`, string-valued `const` |
| `Union` | `anyOf` containing 2–32 distinct string `Literal` nodes; optional `type: string` |

Nested property schemas obey the same grammar and every nested object is
closed. `properties` maps and `required`/`anyOf` arrays are containers, not
schema nodes; no symbol metadata is allowed on them or action metadata.
Other schema keys, including caller-supplied `$id`/`$schema`, annotations,
defaults and bounds, are outside this first authoring grammar. The generator
adds its own resource identity and dialect fields after validation.

Reject mismatched or unknown kinds, including `Unsafe`, and every other symbol,
including TypeBox `Optional`, `Readonly`, `Transform` and custom symbols. The
Kind tag describes shape, not trusted constructor provenance. A compile-time
cast cannot establish compatibility; the captured runtime structure must pass
all checks. This allowlist preserves ordinary TypeBox objects without promising
support for the whole TypeBox API.

### Snapshot lifecycle

The inventory constructor captures a bounded snapshot of membership, schema
nodes and metadata without mutating or freezing caller-owned objects. Retain
the data-class catalog as immutable `JsonDocument` source. Schema validation,
lowering and hashing occur in explicit preparation, not the constructor.
Capture failure records an invalid snapshot; `prepare()` rejects it atomically,
without returning partially qualified fragments. Reject accessors without
calling them, cycles and unsupported graphs within the existing limits.
Developer inputs remain trusted code/data: this is not a sandbox against Proxy
traps or plugins.

Caller mutation before or after the first preparation cannot alter or repair
the captured snapshot. The first successful preparation pins the normalized
schema base URI; repeating it returns the same immutable result, while a
different base URI rejects. A changed declaration, catalog or namespace needs
a new inventory instance. This is local snapshot stability, not a global
registry proving that another inventory never reused a URI.

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

Output resource content needs an explicit host publication policy. As the
[existing schema guidance](../offline-schemas.md#scope-and-trust-boundary)
explains, a manifest hash commits to schema URLs and declared content hashes,
not arbitrary content later supplied under those URLs. With the same namespace
and input, changing only the output schema can leave the action document and
`surface_hash` unchanged while changing output validation. An output-only
probe against the prototype confirms this; it is content-integrity evidence,
not complete manifest conformance.

For integrations qualified by this plan, prohibit in-place replacement of
published schema resources. Preserve the old immutable resource inventory and
publish the changed output under a new URI; for the first generator this means
a new versioned schema base URI. Rebuild and validate the complete manifest
and snapshot. A URI change changes the manifest hashing view, so the pinned
[Surface Hash contract](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/core.md#surface-hash)
also requires a new `surface_version`. A version bump alone does not prevent
overwriting old URI contents. This publication policy is host-owned resource
pinning, not a new `output_schema_hash` field or portable authority proof.

For a later Calcu live switch, rebuild the complete manifest and snapshot,
review the new version/hash and require fresh authority/consent/session
transitions where the selected contract requires them. An old Grant must never
be evaluated against the new snapshot/resources. Under the pinned
[versioning rules](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/core.md#versioning-and-compatibility),
it may remain usable against its exact retained old snapshot until expiry or
revocation. If Calcu retires that snapshot, explicitly revoke/fence its old
authority and verify executor rejection; publication alone does not revoke it.
No dual-hash alias for one snapshot, implicit Grant expansion or automatic
reissuance is introduced by authoring. The live switch is not authorized by
accepting this design document.

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
| Authoring grammar | Ordinary TypeBox Object/Number/String/Literal/Union nodes pass with their Kind tags; mismatched/unknown kinds, extra keywords, Optional/Readonly/Transform/custom symbols and caller `$ref` reject before serialization |
| Metadata and generated resources | Unknown metadata/classes and duplicate action IDs reject; generated URI collisions, missing/conflicting resources and aggregate limit violations cannot produce a prepared inventory; no external resolution |
| Host composition | Complete-manifest validation separately rejects unavailable/conflicting schema resources and dangling references; the authoring grammar itself does not accept caller references |
| Shape and type | Calcu's four operators and another domain compile/validate; extra fields, `sqrt`, wrong types and unsupported schema constructs reject |
| Snapshot and bounds | Mutation before/after preparation cannot rewrite or repair captured declarations; changed catalog/namespace requires a new inventory; same-base preparation returns the immutable cached result; different-base reuse, accessors/cycles and size/depth/inventory limits fail closed |
| Output-only migration | A changed output at unchanged URI/version demonstrates equal action/hash but different validation; a new namespace plus surface version changes bindings, with old resource contents retained unchanged. Offline preparation alone cannot enforce historical publication policy. |
| No executable authority | Handler-bearing declarations reject, prepared result has no execution handle, native application code is not called by preparation |
| Packaging | Actual npm-pack consumers exercise authoring exports; root import/typecheck works without the optional schema peer |
| Complete contract | Calcu host/event/receipt/identity fields remain explicit; one-action full manifest validates, unsupported multi-action composition fails |
| Later migration fence | Old authority rejects against the new snapshot/resources; retained old authority uses only its exact old inventory, and explicitly retired authority rejects. Admission failures call no handler; this is a later live gate, not an offline passing claim. |

Successful delivery means a supported bounded description authoring module,
not a supported issuer, executor, transport, multi-action profile or production
deployment. Record any second-consumer limitations instead of generalizing
from two fixtures to all applications.
