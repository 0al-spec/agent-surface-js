# Selected proposal request/result contract

Status: design decision for the next private SDK qualification, 2026-10-02 UTC.
Not an implemented export, a new ASP profile, a complete transport binding or
permission to migrate Calcu. Complexity: medium; reasoning effort: high.

## Decision

Use the existing `action.request` / `action.result` envelopes, with a closed
**selected subset** for one non-persisted `propose` action. Separate:

1. Transport authentication: credential/proof outside the JSON body.
2. Invocation representation: session, Grant/surface commitments, action,
   execution, input and independently retained result expectations.
3. Receipt evidence: references in messages; complete receipts supplied through
   an explicitly authenticated, host-owned channel and independently verified.

Do not turn Calcu's full binding echo or inline `runtime_receipt` / `receipt`
members into universal ASP fields. No extension identifier or `extensions` bag
is introduced. Keep application schemas, domain validation, authority state,
disclosure and receipt policy outside the generic representation mechanism.

The scenario is simple: the mediator asks the app to perform one exact operation;
the app independently admits it, executes it, and returns a result plus a receipt
reference. The mediator accepts the result only after correlation, output schema,
required receipt evidence and application-specific checks all pass.

## Sources and evidence

The normative source is [spec-lock.json](../../spec-lock.json), revision
`da550fde6f8be4ff0c1ded15524afb66c2912287`, not the Calcu prototype:

- [Action Request](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/core.md#action-request)
  and [Action Response](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/core.md#action-response):
  authorization, binding/hash checks, receipt delivery and response correlation.
- [Execution Context and Binding](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/safe-effects.md#execution-context-and-binding):
  every request has static mode and execution ID; non-persisted proposals may
  omit idempotency key/execution hash under the general RFC.
- [Observability Context](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/evidence.md#observability-context),
  [Receipt Requirements](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/evidence.md#receipt-requirements),
  [Receipt Hash Chain](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/evidence.md#receipt-hash-chain)
  and [Canonical Object Hash Profile](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/evidence.md#canonical-object-hash-profile):
  producer spans, exact receipt linkage, canonical values and hash limits.

Consumer evidence, not normative authority:

- Calcu [P5-T10A at `61da8f2`](https://github.com/SoundBlaster/Calcu/blob/61da8f2fdda8c1865747e8cfb8ab5ccad47fcf51/docs/PRIVATE_PROPOSAL_EXCHANGE.md):
  smaller facade with real Calcu HTTPS/admission/receipts; private selected envelope.
- Calcu [P5-T10B at `a800a8f`](https://github.com/SoundBlaster/Calcu/blob/a800a8f973bcbdb799a2eabbee99463e2d26459b/docs/GREETING_EXCHANGE_QUALIFICATION.md):
  another native consumer and JSON value comparison. Greeting's lease/evidence
  is synthetic, not a second conforming implementation. These PR branches are
  qualification evidence, not a merged SDK or consumer release.

This document complements the [host dispatch contract](host-owned-proposal-dispatch.md).
It does not replace current admission, writer ordering or the
[ADP backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md).

## Scope and field classification

The first candidate selects one manifest-bound non-persisted `propose` action,
`side_effect: false`, no approval/preview/reservation/recovery, and both runtime
and app action receipts. The application still chooses action ID and schemas.
It is a supported SDK subset, not the minimum every ASP implementation must use.

**RFC** below means an existing normative requirement in its applicable scope.
**Selected** means a stricter SDK choice for this candidate, not a new RFC MUST.
All fields in the two chosen envelopes below are required; unknown control
members and `null` in place of required control values reject. Domain `input` /
`output` use the selected application schemas (including their nullability),
not a generic accept-any-object rule.

| Fields | Request | Successful result | Reason / check |
| --- | --- | --- | --- |
| `type`, `payload` | `action.request`, object | `action.result`, object | Existing envelope names; closed selected shapes |
| `session_id`, `session_generation` | Retained active-session selection | Exact request values | RFC: independent current session/tuple checks remain server-side |
| `grant_hash`, `surface_hash`, `action_id` | Retained trusted selection | Exact request values | RFC correlation; a hash is not a credential or authority |
| `grant_id` | Retained Grant ID | Exact request value | Existing example field; Selected explicit echo, not inferred from a response |
| `execution` | Exactly `mode: "propose"`, `execution_id` | Exact request object | RFC request requirement; Selected result echo for non-persisted proposal |
| `idempotency_key`, `execution_hash` | Required by this candidate | Exact request values | Selected for this proposal subset; RFC permits omission for some proposals |
| `trace_id`, `span_id` | Runtime trace and runtime producer span | Same trace, application's own producer span | RFC observability for selected roles; span is not an echo or authorization |
| `input`, `input_hash` | Validated input and its ASP hash | Absent | RFC input binding when runtime evidence is required; app receipt binds it |
| `parent_receipt_hash` | Finalized runtime receipt hash | Absent | Selected linked receipt path; app receipt carries/verifies the parent |
| `result`, `output` | Absent | `success`, validated output | Only successful proposal responses are accepted by this initial value slice |
| `receipt_id`, `receipt_hash` | Absent | Exact reference to the app receipt | Existing response fields; a reference alone cannot complete verification |

Identifiers are nonempty strings; `session_generation` is a positive safe
integer. Selected capacity limits: ordinary IDs at most 256 UTF-16 code units,
execution/idempotency IDs at most 128. These are SDK bounds, not global ASP limits.
Trace/span IDs use the RFC's nonzero 32/16 lowercase hex grammar. Digests use
`sha-256:` plus the 43-character unpadded base64url encoding of a 32-byte digest;
validate canonical encoding, not only the visible prefix/length.
The trusted host supplies explicit positive safe-integer request, response and
complete-receipt byte limits. Calcu's 8192 bytes is not a universal default.
The existing strict JSON nesting capacity also applies.

Each fresh invocation receives fresh execution/idempotency IDs from the trusted
mediator. An execution ID must not be rebound to another request: the host owns
that mapping. Merely including `idempotency_key` does not implement deduplication,
durability, exact retry or exactly-once execution. This candidate performs no
automatic retry and cannot bypass a selected action's normalization requirements.

## Wire examples

These are **shape sketches**, not conformance vectors: angle-bracket strings
stand for independently supplied/recomputed values, not valid example hashes.
The business operation is illustrative; no Calcu action ID is built into the SDK.

```json
{
  "type": "action.request",
  "payload": {
    "session_id": "session-1",
    "session_generation": 1,
    "grant_id": "grant-1",
    "grant_hash": "<trusted-grant-hash>",
    "surface_hash": "<trusted-surface-hash>",
    "action_id": "greeting.propose",
    "idempotency_key": "invocation-1",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id": "b7ad6b7169203331",
    "execution": { "mode": "propose", "execution_id": "execution-1" },
    "execution_hash": "<execution-hash>",
    "parent_receipt_hash": "<verified-runtime-receipt-hash>",
    "input_hash": "<input-hash>",
    "input": { "recipients": ["Ada"], "style": { "prefix": "Hello", "punctuation": "!" } }
  }
}
```

```json
{
  "type": "action.result",
  "payload": {
    "session_id": "session-1",
    "session_generation": 1,
    "grant_id": "grant-1",
    "grant_hash": "<trusted-grant-hash>",
    "surface_hash": "<trusted-surface-hash>",
    "action_id": "greeting.propose",
    "idempotency_key": "invocation-1",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id": "00f067aa0ba902b7",
    "execution": { "mode": "propose", "execution_id": "execution-1" },
    "execution_hash": "<execution-hash>",
    "result": "success",
    "output": { "messages": ["Hello, Ada!"] },
    "receipt_id": "receipt-app-1",
    "receipt_hash": "<verified-app-receipt-hash>"
  }
}
```

No bearer credential, Passport, raw identity artifact, full Grant, `task_hash`,
provider message, endpoint URL or caller-selectable mode enters these envelopes.
The runtime still retains the complete subject/runtime/agent/app/audience/identity
and surface-version expectations privately. The server derives its own tuple
from the presented credential and authoritative state, never from a body echo.
Those full bindings are independently checked in the complete receipts too.
For HTTP, the selected credential-binding profile still controls proof headers.
If `Idempotency-Key` is sent, it must equal the body key; `traceparent` handling
must obey the selected direct trace policy and the RFC's header precedence.
The offline codec does not certify either header or transport authentication.

## Receipt delivery and result acceptance

**Selected:** reference-only action messages. Before sending a receipt-dependent
request, the runtime finalizes its complete receipt and makes it available through
the manifest-selected authenticated `agent_api.receipt_url` channel. The app
retrieves the exact parent, recomputes receipt/policy hashes, authenticates the
producer under the selected trust contract and checks its invocation bindings.
No available/verified parent means no admission; a bare matching hash is not enough.

After execution the app returns its receipt ID/hash. A host-owned receipt adapter
provides the complete app receipt from the selected authenticated channel/store.
An offline SDK value consumes original bounded receipt JSON plus independent
expected context; it does not fetch URLs, accept a response-supplied endpoint,
concatenate an opaque ID into a URL, follow redirects or choose trust roots.
This is not a boolean `receiptVerified` escape hatch: integrity, receipt role,
policy, tuple and parent/input/execution/output bindings all remain prerequisites.

The pinned RFC names receipt delivery but does not fully specify a generic HTTP
upload/read RPC for this path. **No method/path/schema is invented here.** A live
receipt-channel adapter must have an explicit reviewed binding and qualification;
the pure request/result value can be tested with host-supplied evidence first.
Transport authentication of receipts and proof of producer identity are separate
obligations. Unsigned hashes cannot authenticate a replaceable complete chain.

Acceptance order for a success is fixed:

1. Authenticate/bound transport, then strictly parse the original response JSON.
2. Validate the selected closed envelope; compare correlation against the saved
   request, never against values copied out of the response itself.
3. Validate output under the pinned schema before computing its output hash.
4. Obtain and independently verify the exact app receipt ID/hash, policy,
   full tuple, parent receipt, input hash, execution context/hash, result and
   computed output hash. Its `trace_id` and producer `span_id` must agree with
   the response; the app span is distinct from the runtime producer's span.
   The parent records `authorized_for_forwarding`, the app receipt records
   `success`, and the corresponding verified policy decisions allow their
   respective stages; a runtime authorization receipt is not execution evidence.
5. Apply application-specific output/disclosure checks before exposing the typed
   result. Shape/hash/correlation do not establish task meaning or domain truth.

This first trace policy selects a direct no-restart exchange. A valid different
app span is accepted; changed trace/restart evidence is unsupported, not silently
treated as an echo. Later support must implement the RFC's `linked_trace_id`
rules explicitly. HTTP hosts also need correct `traceparent` propagation; JSON
validation cannot certify that transport behavior.

If evidence cannot be obtained after dispatch, do not present verified success,
refund quota, claim zero execution or resend the action. Retain an outcome with
unverified delivery/evidence under host policy. Cancellation, timeout and malformed
response after send likewise do not prove that the application did not execute.
The pure codec's success result is correlated data, not a public certificate of
authority or evidence verification when its external prerequisites were not run.

## JSON value and hash rules

Use the existing strict `JsonDocument` and `asp-jcs-sha-256` primitives. Reject
duplicate members, negative zero, non-finite numbers and malformed Unicode before
lossy parsing/serialization. Compare parsed objects by JCS value, not property
insertion order or raw bytes. Array order, exact strings, missing members and
`null` remain distinct; do not normalize Unicode/URLs or insert defaults.

Hash domains remain `hash/action-input/v1`, `hash/action-execution/v1` and
`hash/action-output/v1` beneath the pinned ASP URI root, over exact validated
input, the selected execution object and validated output respectively. Receipt
and policy hashes retain their own existing views/domains. No new digest or
combined "whole message" authorization hash is introduced.

## Calcu migration delta and compatibility prerequisites

| Current Calcu/private envelope | Selected next contract | Required preservation |
| --- | --- | --- |
| `app_id`, `surface_version`, `subject`, `delegate`, `audience`, `identity_evidence_hash` repeated in both bodies | Not wire members; retained trusted context and complete receipts | Independent full tuple checks remain mandatory |
| Request `runtime_receipt` | Parent hash plus authenticated complete-parent delivery | No hash-only fallback or invented inline extension |
| Response `receipt` | `receipt_id` / `receipt_hash` plus separate complete receipt | No success until required evidence passes |
| Response `parent_receipt_hash`, `input_hash` echoes | Check these in the verified app receipt | Keep request snapshot; reject a receipt for another input/parent |
| Response echoes runtime `span_id` while app receipt has another span | Response carries the app receipt's producer span | Preserve tracing and receipt linkage; no global request-span equality |
| `JSON.stringify` binding comparison in production | JCS value comparison after strict parsing | Accept reordered objects, not changed values or array order |

These are explicit compatibility changes, not a transparent drop-in wrapper.
Do not heuristically detect formats or silently remove unknown fields. Calcu's
current path remains private/unchanged until a new candidate is qualified.

Two declaration gaps are already visible at SDK baseline `e67c834`:

- [The selected manifest validator](../../src/offline-proposal-manifest.ts)
  closes `agent_api` without `receipt_url`. Adding that already-defined RFC field
  needs explicit grammar, URL/route, retained-snapshot and negative tests.
- That validator also closes action declarations without `input_hash_profile`.
  The RFC [Actions contract](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/core.md#actions)
  requires `asp-jcs-sha-256` when receipt chains bind exact inputs. An
  `input_schema_hash` or audit field inventory does not substitute for it. Both
  existing offline acceptance and Calcu receipt tests fall short of this live
  declaration qualification; do not upgrade their conformance claims.

A changed declaration requires the selected new surface/hash and fresh authority
transition; it is not permission to mutate an existing Grant. This decision
changes no source-lock, declaration, endpoint or public export. No RFC change is
needed to select these existing fields; a portable receipt-channel RPC or future
inline extension would require its own upstream/compatibility decision.

## Next qualification and unsupported behavior

Next deliverable: an **experimental offline request/result value** with exact
positive/negative vectors below, packed consumption by Calcu and Greeting, and
an honest distinction between correlated output and externally verified evidence.
Do not copy the private fixture into public exports unchanged. Settle concrete
class names with behavior tests; constructors capture, explicit methods validate.
No arbitrary property bags or per-action inheritance hierarchy are needed.

| Case | Required observation, not yet implemented by this design |
| --- | --- |
| Valid Calcu and Greeting values, distinct runtime/app spans | Same generic mechanics; app schema/evidence rules remain separate |
| Each missing/extra/null field; invalid IDs/hash encoding/generation | Reject at the bounded representation boundary |
| Reordered object members; changed arrays/Unicode/missing values | Accept only the first; exact hash/equality semantics preserved |
| Changed session/generation/Grant/surface/action/key/execution | No accepted result, even if output schema passes |
| Wrong receipt ID/hash/role/producer/tuple/parent/policy/input/output | No verified success; distinguish host authentication from content integrity |
| Receipt missing/unavailable or caller-supplied verified flag | Fail closed; no implicit retry, quota refund or zero-execution claim |
| Borrowed response span or unsupported trace restart | Reject selected trace-policy mismatch; accept the legitimate app span |
| Mutated caller arrays/objects, producer/reader callback re-entry | Original saved request and host expectations remain immutable |
| Credential/identity/Grant added to body; response URL injected | Reject; never fetch, log or expose supplied authority |
| Invalid schema input/output | Validate before hash acceptance and result exposure |
| Unsupported mode/effects/approval/extension/error result | Fail explicitly; no mode downgrade or fabricated success |
| Packed package and browser import boundaries | No private-source imports, executor bypass or authority in browser artifacts |

Read/dry-run/persisted proposals, side effects, approval receipts, execution tokens,
async results, retries/recovery, cross-trace restart, inline extensions and a
general error-envelope codec are outside this first slice. Existing transport
adapters retain their error handling; this document invents no ASP error codes.
The live executor must still enforce current authority, identity, quotas and
disclosure independently. Offline completion does not satisfy those gates.

## Validation of this decision

The five locked source digests and eight pinned normative heading references
were checked locally. Both JSON sketches parse and have the selected exact
member sets and correlated values with distinct producer spans. These checks
verify documentation consistency, not the placeholder hashes or conformance.
The existing 600 SDK tests, packed consumer checks, build, package dry-run and
diff hygiene pass; no new codec, receipt verifier or runtime tests are claimed.
