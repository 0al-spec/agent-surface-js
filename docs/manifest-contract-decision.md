# Selected manifest validation: contract and implementation order

Current implementation follow-up: [offline proposal manifest](offline-proposal-manifest.md)
records the bounded Host-Provisioned Bearer representation slice. The design
checkpoint below remains historical; live identity, issuance and activation are
not established by offline acceptance.

This is an implementation design, not an implemented complete manifest validator
or a new ASP profile. It follows the offline declaration work in SDK PR #5.
The [ASP adoption backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md)
remains the only delivery tracker. No live issuance, Calcu migration, retention
probe or new authorization path is enabled by this decision.

Implementation follow-up: [offline schema resources](offline-schemas.md) now
implements the bounded resource/engine sub-slice, with its actual API, supported
keywords and limits recorded separately. The design below preserves the PR #6
decision checkpoint. Complete manifest acceptance and native issuance remain
unimplemented; do not infer completion from schema tests.

The [Host-Provisioned Bearer source update](compatibility/host-binding-source-update.md)
supersedes the historical unresolved binding/source-pin checkpoint below.
The merged binding is now selected as the implementation target; complete
manifest validation, issuance and live qualification remain unimplemented.

## Decisions

| Area | Decision and remaining limit |
| --- | --- |
| Normative coverage | Add Safe Effects at the existing ASP revision; retain the other four digests and SDK behavior. |
| Schema resolution | Explicit immutable host-supplied resources, self-contained Draft 2020-12 schemas, no implicit retrieval. Implement and qualify this independently next. |
| Manifest inventory | Include cross-section requirements and generic application IDs. An abbreviated Hello/Calcu fixture is not a complete valid manifest. |
| Native issuance metadata | Still an open gate: no reviewed non-OAuth discovery/issuance binding has been selected. Empty placeholders or an invented auth type cannot satisfy it. |
| Complete validation | Only after both schema qualification and the native binding decision. Offline schema success alone cannot unblock it. |

## Source coverage expansion

The revision remains `b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691`.
The added complete module is `drafts/modules/safe-effects.md`, SHA-256
`807dfbf3afd4539df3311ee43ffd37d561fd972045da41b68746896f2303d2e7`.
It supplies [static execution modes](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/safe-effects.md#static-execution-modes),
[risk taxonomy](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/safe-effects.md#risk-taxonomy)
and [approval semantics](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/safe-effects.md#approval-semantics)
needed for the planned action checks.

This is additive source coverage, not a revision upgrade or implementation of
every dependency of those modules. The checker now requires exactly five paths;
tests reject missing, duplicate, unexpected and corrupted sources. The synthetic
older revision in source-checker fixtures is intentional, not a stale runtime pin.
There are no new SDK exports, dependencies, execution modes or receipt behavior.

## Inventory for the future selected manifest

The following is an acceptance inventory, not a claim that current tests cover it:

- Require Core's top-level fields and its cross-section `compatibility`
  declaration, including `min_runtime` and the supported `schema_dialect`.
  Require exact `protocol: "agent-surface/0.1"` and
  `surface_mode: "proposal_only"` for the initial SDK subset.
- Require a supplied `surface_hash` and verify the full manifest hashing view,
  excluding only that self-field. Content equality does not establish
  authenticated discovery, current version or authority.
- Select one non-persisted proposal action and one resolving scope; keep IDs
  application-chosen. Check `risk: "propose"`, `approval: "none"`,
  `side_effect: false`, `execution.mode: "propose"`, nonempty `execution.operation_id`
  and absent or false `execution.persisted`. Unsupported companions, effects,
  idempotency and receipt extensions are outside this initial subset, not
  forbidden by ASP generally. Approval `none` never bypasses Grant/policy checks.
- Resolve and retain both input and output schemas before accepting their
  references. Business schemas remain application-owned; Calcu's four operators
  must not become generic SDK constants.
- Check exposure declarations for every advertised source, including control
  events. Initially select no resources; select events according to actual
  control obligations, rather than assuming an empty event list is sufficient.
- Keep discovery location, protected-resource audience, action endpoint,
  issuance endpoint and session endpoint roles distinct. Do not normalize them
  into one URL or rewrite a manifest after hashing to insert a random port.
- Require the selected identity-evidence discovery/profile combination; reject
  unsupported combinations rather than accepting an arbitrary profile string.
- Validate real selected `auth`, `audit` and `revocation` semantics, not just
  container presence. This item remains blocked on the binding decision below.

Sources: [Core](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/core.md),
[identity evidence](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#pluggable-agent-identity-evidence-profile),
and [Data Exposure](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/privacy.md#data-exposure-contract).
Core also requires `session_control_url` for a Runtime participant, budget
endpoints for the applicable budget dimensions, and delivery metadata when
subscriptions are supported. A small proposal action does not waive those
selected-role obligations. Unsupported dependencies must fail closed.

## Offline schema resource contract

These are proposed SDK restrictions for the next executable slice. They are
not additional ASP wire requirements and introduce no fictional public exports.

1. Accept original schema JSON text through immutable `JsonDocument` values.
   Constructors capture dependencies; explicit preparation performs validation.
   Duplicate members, invalid numbers and invalid Unicode fail before schema
   extraction. Preserve original documents rather than silently repairing them.
2. Use an explicit, unique resource key equal to the manifest's schema URI.
   Missing and duplicate resources fail; there is no network/filesystem fallback,
   redirect, URI rewriting or credential access. Initially support absolute
   HTTPS keys without userinfo or fragments as a bounded SDK choice.
3. Require an object root with exact `$schema`
   `https://json-schema.org/draft/2020-12/schema`. An optional root `$id` must
   equal the resource key; boolean subschemas may be supported. Select and pin
   a Draft 2020-12 engine for metaschema and instance validation rather than
   reimplementing JSON Schema. That dependency is not chosen or installed here.
4. Initially support only same-document JSON Pointer `$ref` targets, with
   correct pointer escaping and schema-location checks. External references,
   nested `$id`, anchors, dynamic references, cycles and unsupported vocabulary
   fail explicitly as unsupported. Inspect only schema-bearing locations:
   `$ref`-looking data inside `const`, `enum`, `examples` or `default` is literal.
5. Keep resource resolution, schema validity, supported-feature qualification
   and instance validation distinct. Do not ignore unsupported assertions,
   coerce values, insert defaults or remove properties.
6. Select and test concrete byte, resource-count, aggregate-size, node and
   reference-work caps in the implementation PR. JSON depth alone does not
   bound wide documents or reference graphs. Initially reject unqualified
   regex/format plugins and dynamic loading rather than claiming bounded work.
7. Prepare once per immutable resource set. Any compiled cache must bind exact
   content and engine options, not just a mutable URL. Never cache failed or
   partially prepared sets, or reuse another registry's substituted resource.

The dialect's terminology comes from [JSON Schema Core](https://json-schema.org/draft/2020-12/json-schema-core)
and [Validation](https://json-schema.org/draft/2020-12/json-schema-validation);
the narrower restrictions above are SDK design decisions.

The ASP `surface_hash` binds schema URIs and any explicit declared hashes, not
uncommitted transitive resource content. Verify a supplied `input_schema_hash`
with the ASP Action Input Schema hash domain. Evidence's mandatory hash and
self-contained rules for idempotency-required actions must not be presented as
automatically mandatory for every non-persisted proposal. Do not invent an
`output_schema_hash` field. Uncommitted resources need independently trusted local
content pins and retained documents; these are not portable Grant proofs or a
new ASP hash profile. See the pinned [Canonical Object Hash Profile](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/evidence.md#canonical-object-hash-profile).

## Native issuance metadata: unresolved gate

The [trusted provisioning decision](trusted-provisioning-decision.md) now maps
the pinned issuance models to Calcu's actual local control path and selects an
app-owned candidate architecture. It records the missing binding decisions and
planned rejection cases; it does not qualify a non-OAuth wire binding or close
this gate.

Compatibility Bearer describes credential presentation, not a complete issuance
API or permission to omit authentication. Core includes OAuth metadata examples
and requires enough information to obtain or validate a Grant. Neither provides
a selected, concrete non-OAuth declaration merely by naming Compatibility Bearer.

Keep the intended non-OAuth development target; do not silently switch to OAuth,
invent `auth.type: "native"` or `"compatibility_bearer"`, or treat `{}` as an
operational contract. Before a complete manifest fixture can pass, document:

- Discovery and endpoint roles, or a qualified trusted provisioning route.
- Principal authentication and exact consent before issuance.
- Request/response shapes, credential delivery and identity advertisement.
- Audience and issuer bindings, current Grant lookup and revocation.
- Applicable audit/control requirements and cross-role positive/negative tests.

The next binding decision should qualify existing app-owned provisioning
separately from bearer protected-resource presentation, identifying existing wire
contracts versus an actual specification gap. If a gap needs normative text,
propose a bounded RFC clarification before exporting that SDK binding. This
document does not authorize that amendment or resolve the gate. Independent
offline schema work may proceed while complete manifest acceptance stays blocked.

## Implementation order and evidence

| Future slice | Required evidence before claiming completion |
| --- | --- |
| Offline resources | Two unrelated application schemas; raw JSON rejection; exact/missing/duplicate resolution; supplied hash mismatch; wrong dialect; escaped pointers; literal reference-looking data; external/dynamic/cyclic references; oversized graphs; repeat failed preparation; no implicit retrieval. |
| Schema engine qualification | Metaschema and supported-keyword inventory; positive/negative instances; no input mutation; bounded computation and no remote plugins. |
| Complete selected manifest | Reviewed native binding and control fixture, generic IDs, compatibility, required hash, unknown-feature rejection, exposure and schema composition. |
| Live integration | Separate stateful consent, identity, Grant/session and transport checks; no inference from offline success. |

PR #6 tested only source-lock verification and recorded this design. The
implementation follow-up qualifies its explicitly supported resource/engine
subset; it does not mark the complete manifest or live integration rows above
as implemented.
