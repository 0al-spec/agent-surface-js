# Consent-bound approved request and private issuance slice

**Status: design proposal; not implemented.** Prepared 2026-09-30 UTC. This is
sequencing/acceptance guidance, not an approved API, contract/status change, or
permission to activate an issuer. Keep source lock `da550fde6f8be4ff0c1ded15524afb66c2912287`
unless a separately reviewed compatibility need is demonstrated.

## Objective and scope

Design the smallest next useful slice for a same-host, proposal-only
Compatibility Bearer development profile: one authenticated request, two distinct consent
decisions, one immutable host-owned approved record, and a single-use transaction that
commits a complete Grant and credential verifier before private mediator delivery.

Calcu is only conditional. In inspected demo boundary
`bb46989c61ff99a6e48e1615a7cf0f8672b80a54`, no ordinary account auth was found:
`server/taskHost.ts` uses a per-process cookie; `server/demo.ts` a fixed demo
subject and ephemeral identity; `server/README.md` distinguishes this from CLI
auth. This is not an authenticated ordinary User. Next is **non-live host
principal, consent, and fence contract qualification**, not a live issuer or
new Calcu login. Use Calcu only if ordinary account auth independently exists
or is separately authorized as product work; otherwise postpone integration. No live activation, production
identity claims, PII retention probes, extra Memos testing, browser issuance,
new endpoints, full ASP role qualification, or conformance claims are authorized.

## Current evidence and boundaries

- SDK PR #18 merged at commit `0c718e0`; its PR evidence records 449 tests.
  This is PR18 implementation evidence, not consent/issuance testing. See
  [PR #18](https://github.com/0al-spec/agent-surface-js/pull/18).
- PR18's `OfflineRequestGrantComposition` validates request and selected-Grant
  representations against one retained manifest, reuses their validators,
  checks expiry attenuation, and returns no approved-record capability, Grant,
  credential, consent, or admission decision. See
  [composition source](../../src/offline-request-grant-composition.ts) and
  [behavior notes](../offline-request-grant-composition.md).
- Existing representation values and constraints remain offline. Host-supplied
  expectation values establish equality, not authenticity. A TypeScript brand,
  schema-valid value, or hash cannot authenticate a participant or prove
  approval.
- The SDK [implementation matrix](../compatibility/host-binding-implementation-matrix.md)
  records identity/consent, atomic issuance, and credential custody/delivery as
  not implemented. Do not restate PR18 as issuer or authority support.
- The canonical ASP ADP backlog owns delivery status and sequencing. ADP-05/06
  remain blocked; this plan does not update them.

Normative source: pinned ASP [Host-Provisioned Bearer Binding](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-binding) and
[Private Issuance and Exact Consent](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-private-issuance-and-consent). The [ADP backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md) owns status and ordering.

## Normative invariants to preserve

1. Private issuance is reachable only from a trusted host control path. Issuer
   input is a host-owned reference resolved in authoritative host state; a
   copied ID, caller-provided subject/runtime, browser/model string, or boolean
   `approved` is not authority.
2. Record the ordinary authenticated User and registered Runtime, independently
   verified agent identity/profile/status, selected policy, exact immutable
   manifest and retained schemas, semantic request, derived projections, and
   both decisions: (a) canonical local Consent Preview confirmation and (b)
   issuer consent for the exact retained material semantics. Neither decision
   substitutes for the other; task prose and Action Approval Receipts are not
   either decision.
3. Immediately before issuance recheck authentication, registration, identity
   status, policy, snapshot/schema binding and both decisions. Bind each to the
   exact material and authoritative revision/deadline.
4. At one issuance linearization point, atomically validate every authoritative
   revision/deadline, consume the approved record once, and commit the complete
   Agent Grant and credential-verifier state. Preserve the complete Grant hash
   view and separately retain the exact credential audience. No silent field
   stripping, repair, or retry under old consent.
5. Every relevant external-authority invalidation must be ordered against the
   commit point, with accepted evidence valid through it. A local DB transaction,
   cached `active`, revision number, or future expiry alone cannot fence an
   external identity/policy source.
6. Any material drift before commit invalidates the record and requires fresh
   preview and consent. Discard any privately prepared credential. Failure to
   prove current validity/order fails closed without usable authority or
   credential delivery.
7. Generate one independent uniformly random 256-bit credential encoded as
   exactly 43 unpadded base64url characters. Its expiry is no later than 60
   seconds after issuance and no later than every earlier applicable evidence,
   policy, or request deadline; preserve the selected request-to-Grant expiry
   attenuation. Credential state stores only the verifier hash, while
   authoritative issuance state also retains the complete Grant and exact
   `credential_audience`. Commit before delivering the complete Grant and raw
   credential to the registered mediator over a private, non-serializable host
   channel. Only the mediator may retain raw credential custody. Browser, model,
   tool arguments, logs, and public responses never receive the raw credential.
8. Same-host Compatibility Bearer remains development/compatibility only; it is
   not proof-bound or sender-constrained. Proposal-only does not waive required
   Grant, identity, consent, credential-custody, session, audit, exposure,
   receipt, or control obligations.

## Host-owned contracts required before implementation

| Dependency / owner | Contract decision required | Stop if unresolved |
| --- | --- | --- |
| Application authentication / Calcu owner | How an ordinary signed-in account is authenticated at the private host boundary; account/session lifecycle and logout fencing. | Do not substitute a demo cookie, process identity, request field, or SDK-provided principal. |
| Runtime registration / deployment owner | Trusted registration and exact runtime binding; revocation/change semantics. | No caller-selected runtime or inferred registration. |
| Identity verifier / trust owner | Selected profile combination, evidence provenance, current status, freshness/deadline and invalidation ordering through commit. | If external invalidations cannot be fenced/ordered, no issuance. |
| Policy and snapshot owners | Authoritative policy revisions; immutable manifest/schema provenance, retention and invalidation. | No reconstruction from mutable URLs/files or unpinned current content. |
| Consent UX and issuer policy owners | Exact safe preview projection, two distinct authenticated decisions/bindings (local-preview confirmation and issuer decision), actor and exact-material binding for each, decision persistence and withdrawal/change behavior. The distinct decisions do not prescribe a gesture/click count. | No single `approved` boolean, task-text inference, or collapsed decisions. |
| State/storage owner | Transaction or equivalent version/fence contract covering all inputs, single-use record consumption, complete Grant and verifier commit, crash/restart and concurrency behavior. | Generic `get`/`set` or local-only transaction cannot claim external authority fencing. |
| Credential/key and mediator owners | CSPRNG and credential/verifier profile, audience custody, private delivery channel, restart custody and uncertain delivery recovery. | No credential in DB/log/UI/model; no silent mint-again after ambiguity. |

SDK responsibility should be reusable closed validation/derivation and explicit
behavior around selected narrow interfaces. Application policy, account and
runtime authentication, identity trust configuration, storage/key custody,
consent decisions, host placement, and private channel remain host/deployment
responsibilities. No public type name, method signature, package split, or
TypeScript brand is frozen by this plan.

## Staged delivery

### Stage 1 — design and contract qualification

Begin with non-live owner qualification of ordinary principal authentication,
the two consent bindings, and commit/revocation fences. Resolve the owner matrix
above for the bounded same-host profile; do not assume Calcu can serve as the
live consumer. Specify the immutable record's material binding and invalidation
semantics, the issuance linearization point, external-source ordering evidence,
and post-commit delivery uncertainty state. Define dependency lifecycle,
retention/data minimization and test fixtures. Estimate reusable SDK engineering
separately from Calcu integration; set slice budget, stop conditions and named
exit evidence before coding. If any mandatory dependency cannot make the
required guarantee, stop and return to design—do not weaken the profile.

### Stage 2 — bounded implementation and tests

Only after Stage 1 decisions: implement the narrow approved-record-to-issuance
behavior against selected host ports, reusing current validators rather than
reimplementing them. Keep constructors inert. Test immutable bindings, fresh
revalidation, commit fencing, consume-once behavior, complete Grant/verifier
state and no-credential failure outcomes. In-memory fakes are unit-test
fixtures only; explicitly label their evidence as non-durable and not host
certification.

### Stage 3 — host integration and evidence

Only if independently authorized and a real ordinary account-authentication
path exists, integrate host authentication, consent, identity, state and
mediator dependencies in the selected consumer. Exercise restart, races and uncertain delivery against
the concrete durable/fenced adapter and the actual private channel. If restart
cannot retain authority state until revocation is confirmed, it must invalidate
all pre-restart credentials at every enforcement point; otherwise block startup
and issuance. Report SDK and consumer effort separately. Do not activate the
route unless every required selected-profile dependency and applicable ADP gate
is satisfied. This slice does not itself qualify HTTPS Action admission,
revocation, sessions, or the whole Host-Provisioned Bearer binding.

## Acceptance vectors

| Case | Expected result / evidence |
| --- | --- |
| Authenticated ordinary account + registered runtime; verified current identity; exact snapshot/policy; both independently recorded decisions; all revisions/deadlines valid | One complete Grant and verifier commit; record consumed once; credential delivered privately after commit. |
| Missing/expired auth, substituted user, generic cookie only, forged or unregistered runtime | Reject; no usable authority, no credential delivery. |
| Missing either decision, decisions collapsed into one, decision for changed preview, task text or receipt offered as consent | Reject; require fresh exact consent. |
| Identity unavailable/stale/inactive, unsupported profile, policy changed, snapshot/schema/request/projection changed or rehashed after consent | Reject at revalidation/commit; invalidate record; discard prepared secret; no repair/retry under old consent. |
| Deadline expires or external invalidation is ordered before/at commit; external ordering cannot be demonstrated | Reject at the serialized commit fence; no Grant/verifier commit or credential delivery. If a valid commit linearizes first, later change follows ordinary admission/revocation rules; test both orderings rather than requiring every race to reject. |
| Same record/reference issued concurrently or replayed after success | Exactly one commit/delivery eligibility; all other attempts reject with no duplicate credential. |
| Crash/restart around prepare, commit, or delivery; delivery timeout/uncertain acknowledgement | No pre-commit usable authority. Freeze committed-but-undelivered authority; confirm revocation before fresh consent/issuance. After restart, alternatively invalidate every pre-restart credential at every enforcement point. If neither can be guaranteed, block startup/issuance. No transparent remint/retry assumption. |
| Attempt to observe secret through browser, model/tool arguments, public response, logs, or persisted verifier store | Test demonstrates no raw credential exposure; credential state contains verifier hash only, while authoritative state retains the complete Grant and exact audience separately. |
| In-memory store passes unit vectors | Report unit behavior only; explicitly not durability, crash-recovery, external-ordering, or host certification evidence. |

## Stop conditions and exit report

Stop before implementation if ordinary account authentication, distinct consent
recording, identity/policy invalidation ordering, transactional consume+commit,
or private mediator custody/delivery lacks an owner-approved contract. Stop if
the requested scope expands into a new normative contract, broad source-lock
change, full binding implementation, live activation, PII retention study, or
unbudgeted reliability work. Do not resolve a blocker by weakening a MUST,
pretending a TypeScript type proves trust, or substituting in-memory success for
durable evidence.

The exit report must state: selected host contracts and owners; implemented
behavior versus fakes; exact positive/negative vectors; commit and delivery
failure semantics; whether external invalidation ordering and restart were
proven on the real adapter; leakage checks; separate SDK/consumer effort; open
gates and limitations. It must not update ADP status/maturity, alter the SDK
source lock, claim conformance, or claim live authority unless separate
authorized work supplies that evidence.
