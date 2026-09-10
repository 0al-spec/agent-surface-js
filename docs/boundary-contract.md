# First SDK + Calcu boundary contract

Status: design and gap inventory. No new SDK exports, accepted wire objects,
schema validators, or conformance claims are introduced by this document.

## Decision

Implement validated binding values in the SDK before issuer/executor behavior,
then integrate each tested behavior into Calcu in a bounded vertical slice.
Calcu need not implement the entire contract first. Do **not**
copy Calcu's `SurfaceSnapshot`, `GrantObject`, or `SessionRecord` into the public
SDK as complete ASP wire contracts. They are useful development records, but
their current shapes omit normative requirements or use different state names.

The initial target is one non-persisted `calculation.propose` action on a
proposal-only surface, with Compatibility Bearer credentials held by a trusted
runtime. No read actions, persisted proposals, write stages, raw credential
release, subdelegation, OAuth lifecycle, Proof-Bound credentials, or optional
purpose/runtime-attestation profiles are selected for this initial slice.
This is an implementation scope, not a new registered ASP profile or an
exemption from base ASP requirements.

The [architecture](architecture.md) defines reusable engines, adapters and
idiomatic integration boundaries. The
[ASP ADP backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md)
alone owns task status and cross-repository approval/order; its updated strategy
is reviewed in [ASP PR #90](https://github.com/0al-spec/agent-surface/pull/90).
This document retains BC-01…08 as acceptance gaps, not another task tracker.

## Evidence and version boundary

Existing comparison and executable SDK lock baseline:
ASP `951871c2d55db25d35512f29cc0970c69aa5cfd9`.
Observed consumer: Calcu `5e5a23f` (hashing consumer branch); its executor,
identity and mediator contracts are unchanged from `4866de0`.
All source links in the comparison table below are pinned.

| Source | Relevant requirements | SHA-256 of complete module |
| --- | --- | --- |
| [Core](https://github.com/0al-spec/agent-surface/blob/951871c2d55db25d35512f29cc0970c69aa5cfd9/drafts/modules/core.md) | Discovery, Actions, Proposal-Only Surface Mode, Session Start | `b1010d279dd1f9f82b28a575748822a02bcf445f133b512c7750200bafaf5cce` |
| [Authorization](https://github.com/0al-spec/agent-surface/blob/951871c2d55db25d35512f29cc0970c69aa5cfd9/drafts/modules/authorization.md) | Identity projection, Grant Object/Hash, Credentials, Session Authority and Lifecycle | `c7fdaee130650146e525d886253336ca19c7f6ace0a5efa6a6f981c47e34a278` |
| [Privacy](https://github.com/0al-spec/agent-surface/blob/951871c2d55db25d35512f29cc0970c69aa5cfd9/drafts/modules/privacy.md) | Data Exposure Contract and effective Grant projection | `cbdd129443e9fe29557dc17321db41e1a7e485049b5c6826ed37b9edb63773c9` |
| [Evidence](https://github.com/0al-spec/agent-surface/blob/951871c2d55db25d35512f29cc0970c69aa5cfd9/drafts/modules/evidence.md) | Canonical Object Hash Profile | `594d71c3972b350dbe21fea6078d301fbbc817470ab3feb07a95bd695ae0b86f` |

These digests document the comparison; they are not an executable compatibility
gate. The current `spec-lock.json` and checker still cover evidence only. Before
implementing the new domain objects, extend their required source set and
negative tests explicitly. Keep the ASP revision unchanged unless a separate
compatibility decision requires an update. The similarly named upstream
`mocks/v1/manifest.schema.json` describes a mock bundle, not an application
Agent Surface Manifest; it must not be used as its schema.

The next slice plans to use the explicit `user_managed` mode defined in the
[newer ASP Privacy revision](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/privacy.md#data-exposure-contract),
not yet in this SDK's executable lock/support. Before accepting it, make an
explicit compatibility change covering the selected authoritative modules,
source digests, validators and regression vectors. This planning edit changes
neither `spec-lock.json` nor existing runtime acceptance. The inventory below
remains a historical comparison, not a claim that all gaps still exist in the
latest Calcu checkout or that the old lock supports the new mode.

## 1. Current Calcu records: exact inventory

The lists below enumerate the emitted fields, not a promise that Calcu currently
validates an arbitrary incoming object of each type. Grant and session records
are constructed inside `createCalcuExecutor`, not deserialized from the caller.
Notation `a.{b,c}` expands to members `b` and `c` of object `a`.

### Surface snapshot

| Field | Current value / shape |
| --- | --- |
| `surface_url` | `https://calcu.local/agent-actions` |
| `surface_version` | `0.1.0` |
| `surface_mode` | `proposal_only` |
| `surface_hash` | Manifest-domain hash of all other snapshot members |
| `actions`, `scopes` | Both exactly `["calculation.propose"]` |
| `credential_audience` | `https://calcu.local/agent-actions` |
| `credential_release` | Exactly `{"mode":"deny"}` |
| `action` | Exactly `{id, execution, side_effect}` |
| `action.id` | `calculation.propose` |
| `action.execution` | Exactly `{"mode":"propose"}` |
| `action.side_effect` | `false` |

This is a local configuration snapshot. In ASP, `actions` contains action
declarations, not strings; the logical audience belongs in
`agent_api.credential_audience`. Its hash is mathematically valid but does not
make this object a complete manifest. Do not confuse this Calcu type with the
SDK's existing content-integrity-only `SurfaceSnapshot` class.

### Issuance input and authoritative Grant

The trusted local input is exactly
`{subject:{user}, delegate:{runtime,agent}, identity:{evidence,artifactBytes},
audience, expires_at}`. `expires_at` is epoch milliseconds, finite, strictly
after the clock and at most 60,000 ms ahead. Identifiers are non-empty strings
of at most 256 UTF-16 code units. Audience must equal the configured snapshot.
`artifactBytes` is a copied, non-empty `Uint8Array` of at most 262,144 bytes.
These are local API choices, not an OAuth/ASP semantic Grant request: the latter
does not carry raw identity artifact bytes.

The emitted Grant contains exactly these top-level members:

`grant_id`, `grant_hash`, `subject`, `delegate`, `resource_server`, `locations`,
`actions`, `scopes`, `constraints`, `credential_profile`, `credential_binding`.

| Nested fields | Current meaning |
| --- | --- |
| `subject.user` | Trusted requesting user's identifier |
| `delegate.{runtime,agent,identity_evidence}` | Trusted identifiers plus verifier-returned envelope |
| `resource_server.{app_id,issuer,surface_version,surface_hash,credential_audience}` | Configured app and retained snapshot values |
| `locations` | Exactly `[surface.surface_url]` (currently the action endpoint) |
| `actions`, `scopes` | Exactly `["calculation.propose"]` |
| `constraints.expires_at` | The input time formatted by `toISOString()` |
| `constraints.credential_release` | Exactly `{"mode":"deny"}` |
| `credential_profile` | `compatibility_bearer` |
| `credential_binding.{method,runtime_id,agent_id,identity_evidence_hash}` | `bearer`, matching delegate ids, hash of verified envelope |

`grant_id` is a generated UUID; `grant_hash` uses the Grant domain with only
the self-field excluded from this internally constructed view. Raw bearer is
32 random bytes encoded as 43 base64url characters. It is returned separately
to the trusted mediator and retained only as a domain-separated verifier hash
by the executor. Neither credential bytes nor that verifier hash are Grant
members. The private record separately owns expiry, active flag, remaining
quota (initially three), identity artifact, and session.

### Identity dependency

The evidence envelope has required fields
`profile`, `format_profile`, `artifact_digest:{profile,value}`, `issuer`,
`subject`, `verification_profile`, `key_binding:{profile,value}`,
`lifecycle:{freshness_profile,status_profile,status_ref}`;
`artifact_ref` is optional. Calcu closes these member sets and recognizes only
its selected combination of ASP envelope/Passport format and local test
verification, key-binding, freshness and status profiles.

The verifier returns `{evidence, identity_evidence_hash, agent_uid,
status_valid_until}` or rejects. Issuance requires matching agent uid and status
freshness covering the Grant expiry. Every action rechecks the retained artifact
and current status. Ephemeral Ed25519 verification authenticates the development
fixture, not the Codex binary. A future SDK verifier interface must retain this
distinction; digest equality alone is never successful identity verification.

### Session record and request binding

Current session fields are exactly
`session_id`, `session_generation`, `state`, `grant_id`, `subject:{user}`,
`runtime_id`, `agent_id`, `surface_hash`. Initial generation is `1` and state
is `active`; Calcu also uses `revoked` and `expired`.

The separate binding adds missing context:
`session_id`, `session_generation`, `grant_id`, `grant_hash`, `surface_hash`,
`subject:{user}`, `delegate:{runtime,agent}`, `audience`, `identity_evidence_hash`.
The private Grant supplies app id and surface version. Reconstructing these
across records is possible, but serializing the session alone loses authority
context; the shortened record must not become the standalone SDK contract.

`revoke()` marks Grant inactive and session revoked. `rotateSession()` increments
generation and also revokes; it is **not** ASP resume. Expiry is observed lazily
on invocation. There is no authenticated session start/state handshake, pause,
resume, completion or failure transition protocol. Task completion currently
revokes a task's Grant rather than recording normative session completion.

## 2. Gaps that block advertising supported behavior

| ID | Observed gap | Required disposition before advertising support |
| --- | --- | --- |
| BC-01 | Snapshot is not a published complete manifest | Construct real action declarations, app identity, audience/endpoints and compatibility metadata; retain exact authoritative discovery bytes and lifecycle identity. No automatic conversion while issuing a Grant. |
| BC-02 | Action lacks stable `execution.operation_id`, schema declarations and `data_exposure` | Add the selected action contract and its schemas; retain non-persisted `propose`, `side_effect:false`, no effects/companion stages. |
| BC-03 | Grant binding has only `identity_evidence_hash` | ASP requires `credential_binding.identity_evidence` to be an exact second copy of `delegate.identity_evidence`. Preserve both in the Grant hash; a hash is not a substitute. |
| BC-04 | Manifest/Grant omit Data Exposure Contract | Define application data classes and handling policy; derive and hash the complete source projection in the returned Grant. Even an empty class set does not permit omitting its selected source entry. |
| BC-05 | Session mixes credential status with lifecycle | Use normative session states and complete tuple, initiator and transition reason; keep Grant validity separate. Do not map `revoked` or `expired` blindly to a terminal session state. |
| BC-06 | JSON binding comparison depends on member order; wire JSON uses `JSON.parse` | Compare schema-validated members structurally; preserve raw JSON until duplicate-key/number/Unicode checks complete. Reject stale/future generations rather than repair them. |
| BC-07 | Local errors collapse distinct protocol failures | Preserve internal diagnostics but map action unknown, mode invalid and integrity mismatch according to the chosen ASP binding; do not export Calcu's generic `action_not_allowed` for all three. |
| BC-08 | Development transport/provisioning differs from discovery metadata | Explicitly map the logical audience, canonical discovery URL and action endpoint to authenticated loopback transport. Do not equate them or change hashes opportunistically per listener port. |

These are migration requirements for SDK + consumer slices, not claims of an exploitable bypass in the
four-operation demo. Existing test success demonstrates the implemented local
boundary, not that the missing protocol contracts are present.

## 3. SDK value contracts by delivery slice

The names below are provisional object roles, not new wire keys or exports.
Parsing, hash verification, identity verification and live admission are separate
operations. Constructors only capture immutable inputs/dependencies (EO policy).
Manifest and Grant values are the first ADP-05 foundation. The session design
below is reserved for ADP-07; it is not additional first-slice implementation.

### Retained manifest binding

The first value object binds exactly `app_id`, `issuer`, canonical `surface_url`,
`surface_version`, `surface_hash`, and the manifest's logical
`agent_api.credential_audience`. It refers to a retained complete manifest and
validated action inventory; it is not a replacement manifest serialization.
URI values are absolute HTTPS URIs where required by ASP; version is an opaque,
non-empty value, not a sortable lifecycle counter. A hash is
`sha-256:` followed by canonical unpadded base64url for 32 bytes.

For this consumer the selected inventory is exactly one action:
`id`/`scope` = `calculation.propose`, `risk` = `propose`, `approval` = `none`,
`execution.mode` = `propose`, `execution.persisted` absent or `false`,
`side_effect` = `false`. Require a stable app-chosen `execution.operation_id`,
input/output schema declarations and complete `data_exposure`. Forbid effects,
write stages and companion links. Do not invent operation identity from the
action name during validation.

The closed input is `{operator,left,right}`: operator is one of `add`,
`subtract`, `multiply`, `divide`; operands are finite binary64 numbers. The
closed successful output adds finite `result` and must echo all three inputs.
Division by zero and result overflow remain application failures, not proof
that admission never happened. Schemas must not advertise `sqrt` or a generic
expression evaluator. Non-persistence does not imply exactly-once execution.

Complete manifest parsing is gated on BC-01/02/04/08, not silently folded into
the existing `SurfaceSnapshot.hash()`. That public method retains its current
content-only contract. A new validator must distinguish an invalid declaration
from a valid ASP feature outside the selected implementation subset; neither
may be accepted by ignoring its authority-bearing members.

### Validated Grant binding

Require the Grant's UUID/opaque non-empty identifier, verified `grant_hash`,
`subject.user`, `delegate.runtime`, `delegate.agent`, both complete and equal
identity-evidence envelopes, and the exact retained manifest app/version/hash.
Require non-empty unique `locations`, `actions`, `scopes`; for this subset their
contents are the one configured action endpoint, action id and scope. Locations
authorize Action Requests, not the OAuth/resource audience or session controls.

Require `credential_profile: compatibility_bearer`, binding `method: bearer`,
matching `runtime_id`/`agent_id`, a valid expiry instant and exactly
`constraints.credential_release:{mode:deny}`. Require an issuer-derived
`data_exposure` projection equal to the selected manifest source closure.
The retained logical audience must match authoritative credential metadata;
Calcu's extra `resource_server.credential_audience` is not a substitute for
`agent_api.credential_audience` or an inferred standard wire alias.

Do not strip unknown Grant members before hashing. Preserve the complete
authoritative view; reject unsupported constraints/profiles rather than treating
them as enforced. Only the defined self-field (and OAuth `type` in that specific
input form) is excluded. This slice will not accept an OAuth authorization-details
object as its input. Parsing a valid object does not issue it, verify current
identity status, prove user consent, or turn its id/hash into a credential.

### Session binding and state

Deferred to ADP-07 (BC-05/06/07), including representation validation and state
behavior. The first ADP-05 slice does not advertise these session objects.

Store the complete tuple, either inline or through immutable exact references:
`subject.user`, `grant_id`, `grant_hash`, runtime, agent,
`identity_evidence_hash`, `app_id`, `surface_version`, `surface_hash`.
Require `session_id`, positive safe-integer `session_generation`, authenticated
`initiated_by`, current state and `transition_reason`. No purpose profile is
selected; purpose-binding fields must not be guessed from task prose.

Normative states are `active`, `interrupted`, `cancelled`, `completed`, `failed`.
Initial accepted start creates generation `1`; only accepted resume increments
it by exactly one. Cancelled/completed/failed ids are terminal and not reusable.
Grant expiry/revocation makes admission impossible independently of session
state. Neither a valid serialized session nor a local worker process can create
an authoritative active record.

The ADP-07 value sub-slice validates representation and tuple equality only. Transition
effects, occupancy, identity status, revocation fences and quota require the
later application-owned state implementation. It must atomically check/commit
generation and quota, including after asynchronous verification. Session cancel
does not itself revoke its Grant, cancel another session or imply rollback of a
started action. A separate authenticated revocation policy remains separate.

SDK state engines may implement these transitions inside the trusted host;
the host still owns policy, principal/identity trust and authority storage.
A transactional adapter must expose the required atomic/fencing semantics.
Representation-only validation or generic key/value persistence is not evidence
of crash-safe admission, and the SDK cannot automatically reconcile an arbitrary
business transaction or external side effect.

## 4. Acceptance matrix for implementation PRs

All rows below are **planned**, not newly passing SDK tests. Existing Calcu tests
in `server/boundary.test.ts`, `https.test.ts`, `hash.test.ts` remain regression
evidence for the development baseline, not substitutes for these new fixtures.
Manifest/Grant rows belong to ADP-05 after the lock update; consent rows to the
coordinated ADP-05/06 work; session/generation/state rows to ADP-07. The complete
tuple fixture is composed ADP-08 evidence, not an ADP-05 completion prerequisite.

| Test | Expected boundary outcome |
| --- | --- |
| Complete selected manifest + matching Grant + exact session tuple (ADP-08 composition) | Value validation succeeds; no execution/issuance side effect |
| Calcu's current abbreviated snapshot submitted as full manifest | Reject, despite correct manifest-domain digest |
| Propose with effects, persisted=true, write companion or unknown mode | Reject unsupported/inconsistent inventory before issuance/admission |
| Changed schema/action/data exposure with old surface hash | Reject integrity mismatch; never repair the retained snapshot |
| Missing/mismatched credential evidence copy or altered envelope member | Reject; hash-only copy does not satisfy projection binding |
| Missing/extra/stale exposure source or wrong ordered class projection | Reject; no disclosure-authority inference from scopes alone |
| Wrong user/runtime/agent/audience/location/app/version/hash | Reject binding; no coercion, URL normalization or object-key-order dependence |
| Duplicate JSON members, non-finite numbers, lone surrogates | Reject before hashing/validation of raw wire input |
| Credential or raw Passport bytes inside wire Grant/session | Reject unsupported members; never echo them in diagnostics |
| Expired/revoked/unavailable identity with otherwise valid values | Later issuer/admission gate rejects; parser cannot declare identity active |
| Generation zero/fraction/unsafe integer/old/future, missing initiator/reason | Reject representation or authoritative binding as appropriate |
| Resume terminal id; resume presented as rotate-and-revoke | Reject transition; no silently substituted state |
| Concurrent quota=1 and revocation during async verification | Later state tests: at most one admitted call; no post-fence admission |
| Unknown required extension/Proof-Bound/optional purpose profile | Explicit unsupported result, never partial enforcement or field stripping |
| Explicit `user_managed` after the reviewed lock update | Preserve exactly in source, issuer-derived `Grant.data_exposure` and consent; no deletion/provider-training claim; stricter applicable policy remains |
| Omitted/unknown retention, extra deletion/lifetime fields, or caller changes a pinned strict contract | Reject; no silent default/downgrade and no reuse of old surface/Grant/consent bindings |
| Changed principal, request, identity or exposure after consent preview | Trusted issuer refuses stale/unbound consent before issuance; browser supplies no derived projection or credential |
| Selected guarantees require an absent/unsupported adapter capability | Explicit configuration/startup rejection where knowable; dynamic authority still checked at invocation; no fallback to memory for required durability |

The new-mode rows are future acceptance cases contingent on the explicit source
lock update above, not features of the currently locked implementation. Reuse
upstream positive/negative vectors and add Calcu-specific policy/HTTPS evidence;
do not invent a separate protocol or treat test-only identity as production trust.

## 5. Next implementation order

1. **Revision and value contract (ADP-05, BC-01/02/04/08).** Review the selected
   newer RFC/source lock, then build SDK manifest/Grant/exposure behavior and
   positive/negative fixtures. Preserve strict JSON/hash boundaries. Calcu owns
   the curated declaration, classifications and handling policy; SDK supplies
   validated construction/interpretation, not policy inferred from numbers.
2. **Projection behavior (ADP-05, BC-03/04).** Build issuer-derived exposure and
   complete identity projection plus independent runtime validation. Hash the
   complete views; never trust client projection, rewrite issued Grants or
   revive old sessions. Identity/trust status comes from explicit verified
   collaborators, not the parser or a successful shape test.
3. **Calcu consent/integration (ADP-05/06 with per-slice ADP-08 evidence).** Replace
   matching development behavior with the tested SDK, preserve the HTTPS path,
   and bind authenticated principal to exact immutable preview and fresh Grant.
   Reject stale consent before issuance; compare returned projection before use.
   User-managed handling does not need agent-internal retention probes. Known
   source restrictions, pre-delivery controls and applicable policies still do.
4. **State engine + adapter (ADP-07 with ADP-08).** Implement BC-05/06/07 lifecycle
   and authoritative atomic admission in reusable SDK behavior, one qualified
   transactional adapter and Calcu integration. Test restart/crash, generation,
   revocation, lineage and unavailable storage. Keep test-only trust explicit.
5. **Stabilization (ADP-09).** After integrated evidence, stabilize demonstrated
   public APIs and validate reuse with a second small consumer. Other language
   wrappers/package boundaries require their own concrete use and evidence.

Each slice records shared SDK work separately from Calcu integration effort,
app-specific code, configuration and manual security decisions. The first
implementation PR must state its selected sub-slice, source-lock change, boundary
claims and positive/negative tests; it is not approval of every step here.
Pure values can be tested without full Calcu migration. ADP-03 design inputs and
scoped ADP-02 approval gate live integration; actual-path tests accumulate within
ADP-05…08, not as a circular prerequisite for starting them.

Full public discovery, privacy enforcement, session control and conformance are
not completed by documenting fields or passing one slice. Required missing
state/identity/consent/durability obligations block activation of the selected
full contract; partial evidence must stay explicitly partial.
