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

`CanonicalObjectHash` computes a hash for a caller-selected domain and hashing
view. The caller is responsible for choosing the correct ASP domain and its
exclusions; use `SurfaceSnapshot` for the implemented manifest view.

## Compatibility and engineering

[spec-lock.json](spec-lock.json) pins ASP `b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691`,
with SHA-256 digests of Core, Authorization, Privacy and Evidence. The
[compatibility review](docs/compatibility/user-managed-source-update.md) records
the update from the original Calcu comparison revision, covering the Hello
fixture's explicit `user_managed` grammar without adding runtime support.
CI requires exactly those sources and verifies each digest in a separate job;
this source coverage does not implement their contracts. Local behavior tests use normative vectors
without network access. Lock updates require explicit compatibility review.

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

The package is not published yet. Full manifest validation, Grant/session state,
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
complete manifest/Grant validation and actual-path handling enforcement remain
separate, unimplemented work. The normative inventory records the decisions
needed before a complete non-OAuth manifest validator can be implemented.
Task status and cross-repository sequence live only in the
[ASP adoption backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md).
