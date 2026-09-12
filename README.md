# agent-surface-js

Experimental TypeScript implementation of Agent Surface Protocol, distributed as
ESM JavaScript and declarations. This initial slice targets Node.js 22+.

```sh
npm ci
npm run check
npm run build
npm pack --dry-run
```

```ts
import { JsonDocument, SurfaceSnapshot } from '@0al/agent-surface';

const snapshot = new SurfaceSnapshot(new JsonDocument('{"z":1,"a":"x"}'));
console.log(snapshot.hash());
// sha-256:Mckhl9gi8ePkXnuOJtPFNE1pe9LhilOGu1OgzxsXb8A
```

This is the minimal normative hashing vector, not a complete ASP manifest.
`SurfaceSnapshot.hash()` verifies content integrity, including a supplied
`surface_hash` when present. It excludes only that top-level self-field, retaining
extensions and nested fields. It does not validate the complete manifest schema
or establish authority. Constructors only capture inputs; behavior methods validate.

`JsonDocument` captures immutable JSON text so duplicate members, negative zero,
non-finite numeric values, and lone surrogates can be rejected before hashing.
Pass original JSON text: `JSON.stringify()` or an earlier parser can already have
erased invalid input. Decimal numbers otherwise follow IEEE 754 binary64/JCS;
no Unicode or array normalization is performed.
The supported input capacity is 256 nested object/array containers; deeper
documents fail with `json_nesting_limit` before recursive parsing. This is an
SDK limit, not an ASP wire restriction. Transport byte limits remain separate.

`CanonicalObjectHash` computes a hash for a caller-selected domain and hashing
view. The caller is responsible for choosing the correct ASP domain and its
exclusions; use `SurfaceSnapshot` for the implemented manifest view.

## Compatibility and engineering

[spec-lock.json](spec-lock.json) pins ASP `da550fde6f8be4ff0c1ded15524afb66c2912287`,
with SHA-256 digests of Core, Authorization, Privacy, Evidence and Safe Effects. The
[compatibility review](docs/compatibility/user-managed-source-update.md) records
the historical update from the original Calcu comparison revision, covering the Hello
fixture's explicit `user_managed` grammar without adding runtime support.
CI requires exactly those sources and verifies each digest in a separate job;
this source coverage does not implement their contracts. Local behavior tests use normative vectors
without network access. Lock updates require explicit compatibility review.
The [manifest contract decision](docs/manifest-contract-decision.md) records the
additive Safe Effects coverage, the implemented offline schema slice, and the still-open
native issuance implementation gate. This is design, not complete manifest validation.
The [trusted provisioning decision](docs/trusted-provisioning-decision.md)
separates app-owned issuance from bearer presentation, with pinned RFC/Calcu
evidence and the remaining binding decisions before public issuer API work.
The [Host-Provisioned Bearer proposal](docs/proposals/host-provisioned-bearer.md)
preserves the historical proposal. Its normative successor is now pinned by the
[Host-Provisioned Bearer compatibility update](docs/compatibility/host-binding-source-update.md);
the SDK still does not implement that binding.

The [implementation matrix](docs/compatibility/host-binding-implementation-matrix.md)
maps merged RFC PR #92 to existing SDK behavior, host dependencies and planned
tests. The source-lock checkpoint is complete; runtime implementation and
activation are not.

[EO policy](docs/engineering/elegant-objects.md) applies to all contributors and
agents. Value objects use explicit behavior and no constructor I/O.

## Offline exposure validation

`DataClassCatalog`, `DataExposure`, and `ManifestExposureDeclarations` now
validate the pinned Data Exposure declaration grammar and inventory coverage.
All three retention modes are supported, including the exact closed
`user_managed` object. See [behavior, examples and limits](docs/data-exposure-values.md).
`ManifestExposureDeclarations` is deliberately a **partial** check: it does not
validate auth, profiles, schemas, action semantics or a complete manifest.
Hashing remains separate; neither operation establishes disclosure authority.

## Offline schema resources

`OfflineSchemaResources` prepares explicit host-supplied JSON Schemas with a
bounded Draft 2020-12 subset, backed by pinned Ajv. Prepared resources resolve
exact URI keys; `resolveInput()` additionally checks the ASP input-schema hash.
Validators accept original `JsonDocument` instances without coercion or defaults.
There is no automatic fetching or schema-engine options escape hatch. See
[usage, supported keywords and capacity limits](docs/offline-schemas.md).
This checks schema content and instances, not a complete manifest or authority.

## Offline proposal manifest

`OfflineProposalManifest` composes strict JSON, required surface hash, selected
Host-Provisioned Bearer declaration grammar, exposure and retained schema
validation. The supported representation is deliberately narrow: one generic
non-persisted proposal, one scope, no resources and the selected revocation
control declaration. See [API, restrictions and evidence](docs/offline-proposal-manifest.md).
Offline preparation is not authenticated discovery, identity verification,
Grant issuance, admission or permission to activate the binding.

The package is not published yet. General manifest validation, Grant/session state,
admission, browser support and transports remain future behavior. Calcu will
integrate supported SDK slices incrementally, not implement the complete RFC
first for later extraction. No full ASP conformance or independent interoperability
is claimed.

See the [architecture proposal](docs/architecture.md) for the target boundaries,
Calcu integration map, modular security engines/adapters and idiomatic
language/framework integration direction. These simplify integration, not
mandatory guarantees, and describe future roles rather than implemented exports.

[API design principles](docs/api-design-principles.md) describe the intended
developer experience, inspired by Foundation Models ergonomics: one operation
definition and separate trusted host setup. The Calcu sketches are design-only,
not runnable SDK examples or new exports.

The [application-first Hello composition](examples/design/hello-composition/README.md)
preserves the owner-endorsed bidirectional, config-first design: a native app,
explicit ports and a separately wired agent adapter. Its native behavior is
tested; the ASP wiring remains an intentionally unconfigured, fictional API
sketch, excluded from the published package.

The [boundary contract inventory](docs/boundary-contract.md) distinguishes the
historically inspected Calcu records from the normative requirements and defines
the first SDK + Calcu slice's planned acceptance cases. Its newer handling-policy
target's source revision is now pinned. The
[exposure declaration sub-slice](docs/data-exposure-values.md) is implemented;
general manifest/Grant validation and actual-path handling enforcement remain
separate work. The bounded offline proposal representation does not close those
runtime gates or qualify Calcu's current declaration.
Task status and cross-repository sequence live only in the
[ASP adoption backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md).
