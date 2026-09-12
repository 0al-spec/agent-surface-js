# Offline Data Exposure declarations

This implemented sub-slice validates **declarations**, not payload handling or a
complete manifest. It is the independently specified part of the planned
Manifest + Data Exposure work. It does not complete ADP-05 or BC-01/02/04/08;
the [ASP adoption backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md)
remains the only delivery tracker. There is no Calcu migration or live probe.

## Behavior and boundaries

```ts
import {
  DataClassCatalog, DataExposure, JsonDocument,
  ManifestExposureDeclarations, SurfaceSnapshot,
} from '@0al/agent-surface';

const catalog = new DataClassCatalog(new JsonDocument(`[
  {"id":"application.result","classification":"private",
   "label":"Result","description":"Application-owned calculation results."}
]`));
const exposure = new DataExposure(new JsonDocument(`{
  "classes":["application.result"],
  "redaction":{"mode":"none"},
  "retention":{"mode":"user_managed"}
}`), catalog);
exposure.validate(); // undefined, or a fixed diagnostic code

// For original manifest JSON text supplied by the application's discovery path:
function checkExposure(originalText: string): string {
  const document = new JsonDocument(originalText);
  new ManifestExposureDeclarations(document).validate();
  return new SurfaceSnapshot(document).hash();
}
```

`checkExposure` above is **not** a full manifest admission function. It checks
exposure declarations and content integrity only. The unchanged
`SurfaceSnapshot.hash()` permits a hashing view without a supplied self-hash;
a future complete manifest validator must require the manifest's `surface_hash`.
Discovery authentication, authority, version lifecycle, profiles, schema
resolution and live enforcement remain separate obligations.

All constructors assign immutable `JsonDocument` dependencies. Explicit
`validate()` methods return `undefined` or throw `Error` with a fixed code.
Validation does not issue a proof or a reusable authorization token. A catalog
memoizes its private known-ID set only after its entire immutable document passes
validation; the set is never exposed or mutated. Failed catalog checks are not
cached. Every exposure class list is parsed and checked independently. Each
manifest validation pass parses the original document and creates one catalog
shared by all its sources, so catalog work is not multiplied by source count.
There is no cross-manifest or global cache. Validation does not sort, normalize,
default, remove fields or change caller documents. Pass original JSON text, not a previously parsed
object whose duplicates or invalid numeric values may already have been erased.
Methods perform no network, filesystem, credential, process or clock operations.

| Object | Checks | Does not establish |
| --- | --- | --- |
| `DataClassCatalog` | Required class fields, four classifications, unique IDs in Unicode code-point order; `validateClasses(document)` also checks ordered declared references | Stability over time, truth of labels, adequate sensitivity classification |
| `DataExposure` | Required classes/redaction/retention, mode-dependent members, declared class references | Completeness of actual output, redaction safety, agent deletion, consent or training permission |
| `ManifestExposureDeclarations` | Required `data_classes`, `resources`, `actions`, `events` arrays; non-empty IDs unique within each source kind; exposure on **every** entry | Full source declaration grammar, proposal-only mode, supported profiles, auth/audit/revocation, schemas, surface hash or Grant source selection |

The manifest checker intentionally inspects only its named concern. Other
manifest/source members are not validated and are never stripped from the
original document. Even a fixture with invalid or placeholder `auth` can pass
this partial check. It must not be used as a substitute for a complete manifest
validator. Resources and events are not silently excluded because a later Grant
may select only one action. An empty inventory is valid for this check, but says
nothing about the required proposal action of a proposal-only surface.

The checker does not require every possible control event unconditionally.
Advertised control events are checked like all other sources, with no exemption
for missing `scope`. Whether an event may be declared as a control event, its
delivery authority, schema and lifecycle are outside this exposure checker.

## Supported grammar and safe diagnostics

- All four classifications: `public`, `private`, `sensitive`, `credential`.
  Accepting the last category does not authorize disclosing a credential.
- `none` redaction omits `policy_id` and `summary`; `policy` requires both.
- `transient` requires boolean `delete_on_grant_end` and omits `max_seconds`.
- `bounded` requires both the boolean and a positive safe-integer `max_seconds`.
- `user_managed` is exactly `{"mode":"user_managed"}`. Any extra member is invalid.
- Explicit empty classes are accepted; omission, duplicates, unknown references,
  unknown classification/mode and noncanonical array order are rejected.

This SDK subset closes class entries, source exposure, redaction and retention
objects. Unknown extension members produce `unsupported_data_classes` or
`unsupported_data_exposure` rather than partial acceptance. Known forbidden
members and any additional `user_managed` member are invalid. These extension
restrictions are implementation scope, not a new general ASP extensibility rule.
Positive integers above `Number.MAX_SAFE_INTEGER` and whitespace-only identifiers
or display strings are outside the supported grammar. Strings are never trimmed
or rewritten; the validator cannot decide whether a summary is consent-safe.

Known grammar errors use `invalid_data_classes`, `invalid_data_exposure`, or
`invalid_manifest_exposure` (missing/wrong inventories or ambiguous source IDs).
The existing raw boundary codes propagate unchanged: `invalid_json`,
`duplicate_json_member`, `invalid_json_number`, `invalid_unicode`.
All `JsonDocument` consumers, including hashing, now reject more than 256 nested
object/array containers as `json_nesting_limit`. An iterative token scan enforces
this SDK capacity limit before recursive parsing, without counting delimiters
inside strings. This closes a stack-exhaustion finding from independent review;
it is not a new normative ASP restriction or a substitute for transport byte limits.
Messages contain no input, identifier, path, policy text or secret. These are
SDK-local diagnostic codes, **not** ASP wire errors. In particular,
`data_exposure_violation` concerns an actual payload crossing a boundary; these
objects do not observe such a crossing.

Successful declaration validation is not evidence that the declared classes
cover every result, echo, preview or error. That remains application-owned.
`user_managed` makes no ASP deletion promise; it does not waive authority,
redaction, source restrictions or separately selected policies. Grant projection,
consent and actual-path enforcement are not implemented here.

## Source and tests

The original exposure implementation was qualified at
[`b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691`](https://github.com/0al-spec/agent-surface/tree/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691).
The exposure implementation did not change the revision or its four source
digests. The [subsequent coverage decision](manifest-contract-decision.md) adds
Safe Effects at the same revision without changing exposure behavior.
The [current source update](compatibility/host-binding-source-update.md) advances
the pin to merged Host-Provisioned Bearer text; exposure grammar and these
historical requirement links remain unchanged.

| Pinned requirement | Evidence in this package |
| --- | --- |
| [Privacy: Data Exposure Contract](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/privacy.md#data-exposure-contract), lines 21–51, 78–116 | `tests/data-exposure.test.ts`: catalog, Unicode ordering, redaction, all three retention modes, negative grammar and raw JSON |
| Same section, lines 53–83 and 157–171: every source has exposure | `tests/manifest-exposure.test.ts`: all source kinds, control events, missing/invalid declarations |
| Same section, lines 125–140: changes do not rewrite old bindings | Hash/declaration composition regression rejects a stale supplied hash after changing retention; this is not a version-state or Grant implementation |
| [Evidence: Canonical Object Hash Profile](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/evidence.md#canonical-object-hash-profile) | Existing hashing tests remain unchanged; added checks preserve source fields and detect duplicate raw members outside the inspected exposure subtree |

Retention vectors are also corroborated by the pinned upstream
[`test_user_managed_retention.py`](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/conformance/tests/test_user_managed_retention.py)
and the exposure definitions of
[`impact-simulation.schema.json`](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/conformance/v1/impact-simulation.schema.json).
They inform tests, not the source lock or a complete manifest schema claim.
No new schema dependency, generated schema language or framework is introduced.

## Decisions needed before the complete manifest slice

The normative inventory exposed gaps in the earlier implementation plan. They
must not be filled by silently copying a development record into a wire format:

1. **Issuance metadata.** Core requires `auth`, `audit`, `revocation` and enough
   endpoint information, but its populated `auth` example selects OAuth. The
   chosen non-OAuth development path needs an explicit supported declaration
   contract. Empty placeholders do not prove it operable. Do not invent
   `auth.type: "compatibility_bearer"`: Authorization selects that profile in a
   Grant, not through a defined manifest field.
2. **Complete compatibility inventory.** Core's Versioning and Compatibility
   section requires `compatibility` including `min_runtime` and `schema_dialect`,
   even though the earlier top-level skeleton omits it. New generic identity
   evidence issuance requires its applicable discovery advertisement. Full
   validation cannot ignore such cross-section obligations.
3. **Schema resolution.** Select an explicit offline schema registry and
   supported self-contained dialect, or another reviewed resolution contract.
   The strong input-schema hash/self-contained rules in Evidence apply to
   idempotency-required actions, not automatically to every non-persisted
   proposal. An unresolved URI is not a validated schema; no implicit fetch.
4. **Source completeness.** Full action semantics reference Safe Effects. The
   [coverage decision](manifest-contract-decision.md) now pins it alongside the
   original four modules. This resolves that source-coverage prerequisite, not
   the implementation of action semantics.

The [follow-up decision](manifest-contract-decision.md) selects offline schema
resources and engine qualification as the next executable slice. The non-OAuth
issuance binding remains a separate gate before complete manifest acceptance.
Keep app-chosen IDs;
Calcu is a fixture/consumer, not a hardcoded SDK protocol. After that, proceed to
the planned Grant representation and exact exposure projection. No live
integration, retention probes or protocol amendments are authorized by these
partial validation results.
