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

[spec-lock.json](spec-lock.json) pins the same ASP revision used by the Calcu
experiment, with the SHA-256 of the upstream evidence module. CI checks that
source digest in a separate job; local behavior tests use the normative vectors
without network access. Lock updates require explicit compatibility review.

[EO policy](docs/engineering/elegant-objects.md) applies to all contributors and
agents. This first slice has three focused objects and no constructor I/O.

The package is not published yet. Full manifest validation, Grant/session state,
admission, browser support, transports, and Calcu migration are subsequent design
decisions. No full ASP conformance or independent interoperability is claimed.

See the [architecture proposal](docs/architecture.md) for the target boundaries,
Calcu extraction map, and incremental delivery criteria. It describes future
roles, not additional implemented exports.
