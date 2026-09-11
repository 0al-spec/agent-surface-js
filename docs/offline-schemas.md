# Offline schema resources

## Usage

```ts
import { JsonDocument, OfflineSchemaResources } from '@0al/agent-surface';

const uri = 'https://hello.invalid/schemas/result';
const resources = new OfflineSchemaResources([{
  uri,
  document: new JsonDocument(`{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://hello.invalid/schemas/result",
    "type": "object",
    "properties": { "message": { "type": "string", "const": "Hello, world!" } },
    "required": ["message"],
    "additionalProperties": false
  }`),
]).prepare();

resources.resolve(uri).validate(new JsonDocument('{"message":"Hello, world!"}'));
// A different message or an extra property throws a fixed SDK diagnostic.
```

`OfflineSchemaResources` captures a snapshot of the entry list, preserving
duplicate keys for rejection rather than silently collapsing them into a map.
`prepare()` validates the whole set before publishing a prepared result and
caches only success. A failed preparation exposes no partial registry. Repeated
success returns the same prepared set; another resource set has its own validators.

The returned `PreparedSchemaResources` and `PreparedSchema` are behavior
interfaces, not public engine constructors or authorization tokens. `resolve(uri)`
requires an exact key. When the selected ASP action declares `input_schema_hash`,
use `resolveInput(uri, inputSchemaHash)` to verify that hash before obtaining the
validator. `resolve()` alone does not enforce a hash supplied elsewhere. Each
`validate(JsonDocument)` checks a fresh parse and returns `undefined` or throws;
there is no object-input overload, data coercion or normalized output.

## Qualified subset

Root schemas must be objects with the exact Draft 2020-12 `$schema`; optional
root `$id` must equal the resource key. Boolean subschemas are supported.
Resource keys use absolute ASCII URI syntax with the literal `https://` prefix,
without credentials or a fragment; non-ASCII and otherwise disallowed characters
must be percent-encoded.
Malformed percent escapes are rejected. References likewise require valid
fragment syntax: a space in a pointer token is written `%20`, not a raw space.
Schema-bearing traversal covers `$defs`, `properties`, `prefixItems`, `items`
and `additionalProperties`. Same-document JSON Pointer references resolve only
to schema locations, including boolean schemas; literals are not schema targets.
References are decoded once, without URI-key rewriting. Cycles are rejected;
shared acyclic targets are permitted within the expansion budget.

The keyword allowlist includes scalar `type`, `const`, `enum`, numeric bounds,
string length bounds, array length bounds and the item keywords
above, object size bounds, `properties`, `required`, `additionalProperties`,
and inert standard annotations. Literal values in `const`, `enum`, `default`
or `examples` do not become reference declarations. Ajv strict-mode schema
checks still apply; allowlisting a keyword does not make every combination valid.

Combinators, type unions, `multipleOf`, regex/format, `uniqueItems`, `contains`, dependent and
unevaluated keywords, `propertyNames`, dynamic/recursive references, anchors,
nested IDs/dialects, external references and unknown keywords are unsupported.
These are explicit SDK scope restrictions, not new ASP requirements.

Schema maps, required names and object equality literals reject these reserved
names rather than claim unsupported Ajv property/equality behavior works:
`__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`,
`__proto__`, `constructor`, `hasOwnProperty`, `isPrototypeOf`,
`propertyIsEnumerable`, `prototype`, `toLocaleString`, `toString`, `valueOf`.
Inert annotation payloads are not assertion literals. Unexpected engine
exceptions still become a fixed SDK diagnostic, without engine text.

## Fixed capacity limits

These conservative implementation limits cannot be changed through an engine
options escape hatch. They are not normative ASP wire limits.

| Quantity | Maximum |
| --- | --- |
| Resources / raw UTF-8 bytes per resource / aggregate bytes | 16 / 64 KiB / 256 KiB |
| Schema-bearing nodes per resource / aggregate | 256 / 512 |
| Schema containment depth, root at zero | 32 |
| Members per schema map / prefix items / enum values / required names | 64 / 32 / 32 / 64 |
| Assertion-literal units per resource | 4,096 |
| Reference occurrences per resource / aggregate | 64 / 128 |
| Expanded evaluation visits / evaluation path depth | 2,048 / 64 |
| Static evaluation weight | 8,192 |
| Instance raw UTF-8 bytes / JSON nodes / depth, root at zero | 64 KiB / 4,096 / 64 |
| Instance work units times expanded schema weight | 262,144 |

Work accounting includes structural nodes, string/property-name lengths and
assertion-literal costs, with repeated references counted repeatedly. A wide or
complex valid JSON document can exceed this subset even below its byte limit.
Resource byte limits precede parsing; qualification precedes compilation;
instance capacity checks precede engine evaluation. There is no wall-clock
timer interrupting synchronous evaluation.

`JsonDocument.utf8ByteLength()` measures retained UTF-8 bytes without exposing
the text. `parse(maximumBytes)` optionally rejects an invalid byte limit or an
oversized source as `json_byte_limit` before parsing. Existing unbounded calls
retain their prior behavior and the global 256-container nesting limit.

## Scope and trust boundary

This slice follows the [manifest contract decision](manifest-contract-decision.md).
It separates schema-resource and instance checks from complete manifest
acceptance, native issuance metadata, discovery authentication and Grant/session
authority. Passing a schema check does not authorize an application operation or
prove that an agent understood the user's task. The
[ASP adoption backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md)
remains the delivery tracker; no live adoption gate is closed here.

Resources are supplied explicitly by the trusted host as original JSON text.
A URI is a lookup key, not permission to retrieve anything. No schema loader,
network fallback, redirect or filesystem lookup belongs to this SDK boundary.
The host is responsible for authenticated discovery and selecting trusted
content. Identical URLs in different resource sets do not imply identical schemas.

ASP hashes bind content, not its publisher. The input-schema hash uses the pinned
[Action Input Schema domain](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/evidence.md#canonical-object-hash-profile)
without exclusions. A manifest hash commits only to schema URLs and explicitly
declared content hashes, not arbitrary content later found under those URLs.
There is no invented output-schema hash or new wire profile. Host-owned resource
pinning is not portable Grant evidence.

## Engine selection and limits of the guarantee

The selected engine is [Ajv 8.20.0](https://github.com/ajv-validator/ajv/releases/tag/v8.20.0)
under MIT, using its Draft 2020-12 implementation. SDK qualification must run
before engine compilation: metaschema validity does not establish supported
keywords, acceptable reference complexity or safe instance-processing cost.
The SDK must reject unsupported assertions rather than silently ignore them.

This is Node.js in-process validation, not a sandbox, a browser adapter or a hard
wall-clock deadline. Ajv's [security guidance](https://ajv.js.org/security.html)
treats schemas as trusted application code and warns about expensive compilation
and evaluation. Structural limits and a restricted feature set reduce that risk;
they do not prove arbitrary hostile schema execution safe or replace deployment
isolation. Do not enable browser `unsafe-eval` to reuse this component.

The host does not receive an engine instance or switches for coercion, default
insertion, property removal, plugins or remote loading. Validation must preserve
the original data model. Fixed SDK-local diagnostics must not echo schema text,
instance data, reference URIs or underlying engine messages.

## Verification

The focused tests qualify original-text Hello schemas and a separate Calcu input
schema, raw JSON rejection, exact lookup/hash binding, pointer escaping and
literal immunity, cycles/shared references, capacity limits, transactional
preparation, non-mutating validation and fixed diagnostics. The independent
input-schema golden in tests uses an ASCII-only, manually JCS-ordered wrapper;
it is not generated by the SDK implementation being tested.

CI runs these tests on Node 22 and 24 and checks the built root package imports
with `node scripts/check-package.mjs`. A local isolated tarball install also
exercises actual runtime dependencies. These checks are schema-subset evidence,
not full Draft 2020-12 conformance, ASP certification, transport or live adoption.
