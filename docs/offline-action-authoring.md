# Optional offline action authoring

`@0al/agent-surface/authoring` prepares immutable ASP action documents, schema
resources and shape validators. It is an optional **Node.js 22+ offline
description layer**, not an issuer, executor, transport or browser integration.
It never accepts or calls a business handler. The base SDK export is unchanged.

Install the selected optional peer explicitly when using authoring:

```sh
npm install @0al/agent-surface @sinclair/typebox@0.34.52
```

This is the package contract; this repository does not claim a published stable
release. Local packed consumers qualify the experimental package. TypeBox
0.34.52 is the tested authoring version (MIT), not a new wire format. The root
SDK import and its declarations work without installing TypeBox.

## Small application-owned declaration

```ts
import { JsonDocument } from '@0al/agent-surface';
import {
  type ActionDeclaration,
  type ActionOutput,
  OfflineActionInventory,
} from '@0al/agent-surface/authoring';
import { Type } from '@sinclair/typebox';

const greeting = {
  action: {
    id: 'greeting.propose',
    scope: 'greeting.invoke',
    risk: 'propose',
    side_effect: false,
    approval: 'none',
    execution: {
      mode: 'propose',
      operation_id: 'greeting.prepare',
      persisted: false,
    },
    data_exposure: {
      classes: ['greeting.text'],
      redaction: { mode: 'none' },
      retention: { mode: 'user_managed' },
    },
  },
  input: Type.Object({}, { additionalProperties: false }),
  output: Type.Object(
    { greeting: Type.Literal('Hello, world!') },
    { additionalProperties: false },
  ),
} satisfies ActionDeclaration;

// This classification is an application decision, not an SDK inference.
const classes = new JsonDocument(JSON.stringify([{
  id: 'greeting.text', classification: 'public',
  label: 'Greeting', description: 'The fixed public greeting.',
}]));
const inventory = new OfflineActionInventory(classes, [greeting]);
const prepared = inventory.prepare('https://app.example/schemas/v1/');

type GreetingOutput = ActionOutput<typeof greeting>;
const value: GreetingOutput = { greeting: 'Hello, world!' };
prepared.validateOutput('greeting.propose', new JsonDocument(JSON.stringify(value)));
// prepared.actionDocuments and prepared.schemaResources feed host composition.
// No application function has run and no Grant or session has been issued.
```

`ActionInput<typeof declaration>` and `ActionOutput<typeof declaration>` retain
TypeBox inference. Native application types and functions may remain independent;
check their correspondence at the integration boundary. No SDK-owned handler
binding is introduced. The [packed consumer](../examples/consumers/authoring/consumer.ts)
demonstrates arithmetic plus a non-arithmetic greeting, independent native
types, and compile-time rejection of `sqrt`, a string numeric result and a
handler-bearing declaration. These are SDK consumer fixtures, not a replacement
for Calcu's existing offline or live integration.

## Grammar and lifecycle

The [closed grammar](plans/offline-action-authoring-module.md#closed-typebox-grammar)
accepts only closed required-field objects, numbers, strings and plain string
literals/unions. Both roots are objects. Empty objects may omit `required` or
use `[]`. Every schema node needs the matching own TypeBox Kind data tag;
other symbol metadata, hidden string fields, getters and executable values
reject before serialization. Kind is not trusted constructor provenance.
`Unsafe`, Optional, Readonly, Transform, references, arrays, bounds, annotations
and caller `$id`/`$schema` are unsupported in this first authoring grammar.
Base wire validators keep their broader, separately documented subset.

Construction captures bounded own data without freezing the caller's objects,
parsing the class catalog, compiling schemas or hashing. It records capture
failure for rejection at `prepare()`. Shared acyclic nodes are copied per
occurrence; cycles reject. Constructor capture is limited to 4,096 values,
depth 64 and 1,000,000 UTF-16 key/string units. This is trusted developer data,
not a sandbox for hostile Proxy objects or plugins.

Preparation validates explicit metadata and application classes, generates
resources, then qualifies the entire inventory through `OfflineSchemaResources`
before publishing an immutable result. The class catalog has a 64 KiB source
limit here. Each action generates two resources; at most eight fragments fit
the existing sixteen-resource limit. All base per-resource and aggregate
[schema limits](offline-schemas.md#fixed-capacity-limits) still apply; the
effective admissible size is the intersection of capture and schema limits.
Empty inventories are permitted and grant no capabilities.

Caller mutation cannot change or repair a captured inventory. Repeating
successful preparation with the same normalized HTTPS namespace returns the
same result; a different namespace rejects. Changed declarations, class catalog
or namespace require a new inventory. Invalid preparation publishes no partial
result. A namespace is only a URI prefix, never permission to perform network
or filesystem access.

For untrusted instances, pass original JSON text to `JsonDocument`, not a
previously parsed/reserialized value. Input/output validation rejects duplicate
keys, invalid JSON numbers, unknown fields and unsupported operation values
without coercion. It proves shape, not arithmetic correctness, task intent,
side-effect freedom or authority.

## Hashes, composition and publication

Resources use `<namespace><percent-encoded-action-id>.input.json` and
`.output.json`, with generated `$id` and Draft 2020-12 `$schema`. String literal
unions lower to `type: string` plus `enum`; action and enum order are preserved.
Input hashes use the existing ASP Action Input Schema hash domain. Two-namespace
golden vectors pin schemas, descriptors and hashes.

The host still supplies discovery, issuer, compatibility/identity, auth,
scopes, events, receipts and revocation fields, then validates the complete
manifest. The existing `OfflineProposalManifest` still accepts exactly one
action and one scope. Several qualified fragments do not prove multi-action
manifest conformance. The source lock is unchanged.

**Output-only changes may leave the action and manifest hash unchanged** if
the output URI is reused. Prepared inventories are isolated but cannot enforce
historical publication policy. Preserve old schema resources immutably; publish
changed output under a new namespace, regenerate the manifest and issue a new
`surface_version`. A version bump alone cannot prevent overwriting old URI
contents. No `output_schema_hash` is invented.

Old Grants must not be reinterpreted against new resources. They may remain
valid against their exact retained old snapshots; retiring those snapshots
requires an explicit authority transition. Authoring does not issue, expand or
revoke Grants. The [design's migration rules](plans/offline-action-authoring-module.md#output-and-compatibility-rules)
remain the gate for a later Calcu live switch, which is not performed here.

## Diagnostics and verification

Errors contain fixed codes, not caller data:

- `authoring_capture_invalid`: unsupported captured value, accessor/cycle,
  hidden field, malformed array or exceeded capture budget;
- `invalid_action_declaration`, `unsupported_action_metadata`,
  `unsupported_execution_metadata`: closed declaration/metadata violations;
- `action_schema_must_be_closed_object`, `action_schema_required_fields`,
  `unsupported_action_schema`, `unsupported_action_schema_metadata`,
  `unsupported_action_union`: unsupported TypeBox grammar;
- `invalid_schema_base_uri`, `schema_base_uri_changed`, `duplicate_action_id`,
  `duplicate_schema_resource`, `action_not_declared`: namespace/inventory errors.

Existing JSON, data-exposure and schema validation/limit errors propagate.
These diagnostics are offline SDK errors, not a new ASP transport envelope.

`npm run check` includes the authoring behavior tests and
`npm run test:authoring-consumer`. The latter installs real tarballs into two
temporary directories: root-only without TypeBox and opt-in with TypeBox.
Both typecheck with `skipLibCheck: false` and execute compiled code; temporary
artifacts are removed even on failure. No model calls or live authority are
involved. The private prototype remains a comparison baseline until a separate
Calcu offline-consumer migration replaces it.
