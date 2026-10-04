# Consent-bound approved request and private issuance slice

**Status: design proposal; not implemented.** Prepared 2026-09-30 UTC;
updated 2026-10-04 UTC. This is
sequencing/acceptance guidance, not an approved API, contract/status change, or
permission to activate an issuer. Use the current `spec-lock.json` revision;
changing it requires a separately
reviewed compatibility decision. Historical inspection pins remain historical.

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
principal, consent, and fence contract design**, not a live issuer or
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
- The repository's private `@0al/offline-proposal-exchange-experiment` package
  explores the selected inline proposal receipt path and offline receipt-pair
  integrity checks. It depends on the base SDK as a peer, is excluded from the
  base SDK tarball, and is not a public SDK API or an available Stage 2 dependency
  for SDK consumers. Its [qualification report](../reports/offline-proposal-receipt-integrity.md)
  records experiment evidence only: retained-representation checks do not
  authenticate the principal, either consent decision, or current host authority.
  The [inline receipt source update](../compatibility/inline-receipts-source-update.md)
  records compatibility evidence for the current source lock.
- The canonical ASP ADP backlog owns delivery status and sequencing. ADP-05/06
  remain blocked; this plan does not update them.

Normative source: pinned ASP [Host-Provisioned Bearer Binding](https://github.com/0al-spec/agent-surface/blob/814084f4d7d06ac85be358ba84533d0718607746/drafts/modules/authorization.md#host-provisioned-bearer-binding) and
[Private Issuance and Exact Consent](https://github.com/0al-spec/agent-surface/blob/814084f4d7d06ac85be358ba84533d0718607746/drafts/modules/authorization.md#host-provisioned-bearer-private-issuance-and-consent). The [ADP backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md) owns status and ordering.

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

## Host-owned obligations to specify before bounded SDK implementation

Stage 1 specifies these obligations, failure outcomes and test vectors. It does
not require a deployed host or passing integration tests. Concrete adapter
evidence belongs to Stage 3; live activation belongs to Stage 4. Memos is a
candidate adapter, not a prerequisite or normative source for the TS SDK.

| Dependency / owner | Contract decision required | Stop if unresolved |
| --- | --- | --- |
| Application authentication / selected host owner | How an ordinary signed-in account is authenticated at the private host boundary; account/session lifecycle and logout fencing. | Do not substitute a demo cookie, process identity, request field, or SDK-provided principal. |
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

## SDK/host boundary for the next implementation decision

The implementation boundary is behavioral, not a proposed list of public
classes. The existing SDK values are offline inputs to a later issuance path;
they are not capabilities. Before Stage 2, keep ownership divided as follows:

| Responsibility | Reusable SDK behavior | Host/deployment behavior |
| --- | --- | --- |
| Request and Grant material | Revalidate the selected manifest, schemas, semantic request, complete Grant, issuer-derived exposure, and request-to-Grant attenuation against retained bytes. | Select the authoritative immutable versions and provide the exact retained material; never rebuild it from an agent response or mutable URL. |
| Principal and Runtime | Compare closed values and bindings once trusted host facts are supplied; reject missing or mismatched facts. | Authenticate the ordinary User, resolve the registered Runtime and enforce their lifecycle/revocation. A user ID, cookie, TypeScript brand, or `active` flag is not proof. |
| Identity and policy | Validate supported evidence representation and deterministic projection; consume explicit current decisions from trusted collaborators. | Own trust roots, profile/status policy, freshness and invalidation ordering; publish the authoritative policy and revision. |
| Consent | Check two distinct decisions against the same retained, canonical preview and exact material, including actor, purpose, revision and deadline fields selected by the contract. | Authenticate each decision-maker, record and withdraw decisions, render the safe preview, and own the consent lifecycle. Two booleans or task text do not substitute for these decisions. |
| Issuance ordering | Reuse validators and deterministic Grant/credential-verifier derivation against a specified host finalization contract; unit fixtures are not qualified adapters. | Atomically revalidate every participating authority revision, consume the approved record once, and commit the complete Grant plus verifier state. Existing writers must share that ordering boundary; qualify the actual adapter before activation. |
| Credential and delivery | Enforce the selected encoding/expiry rules and return only the contractually allowed result to the trusted mediator path. | Generate secret material with a CSPRNG, keep raw credential custody private, store verifier-only credential state, and recover uncertain post-commit delivery without reminting under old consent. |

The required shape is therefore:

```text
trusted host prepares exact material and records both decisions
    → host enters its finalization transaction / equivalent ordering boundary
        → host resolves authoritative material and invokes SDK validators
        → host revalidates revisions/deadlines, consumes once and atomically commits
    → host privately delivers the committed result to the registered mediator
```

The host controls finalization and calls SDK validation/derivation behavior
inside that boundary, over the exact retained material selected there. The SDK
does not orchestrate separate check/save callbacks. Validators must be pure,
deterministic behavior over retained bytes and explicit inputs (including any
time value), with no network, storage, implicit clock or mutable-source lookup.
Preparation outside the boundary is advisory and cannot replace these checks.
Validation runs while the ordering boundary is held; the commit is the
linearization point, not the earlier validator invocation.

The SDK must not manufacture atomicity by composing independent `get`,
`isActive`, `approve`, `consume` and `save` callbacks, or by adding an SDK-local
mutex that existing account, identity, policy or session writers do not join.
Nor should it expose a reusable “admitted” flag or raw issuance capability to
the browser, model or application handler. If the selected host cannot provide
one qualified finalization boundary, block that host's live issuance. Bounded
SDK implementation against explicit non-live fixtures may proceed; do not
weaken the selected guarantee or advertise those fixtures as host qualification.

This boundary clarifies a design gate only. It does not complete Stage 1, approve
an SDK API, update ADP status, or authorize Calcu/Memos integration. Stage 2 may
start after the bounded contract's inputs, outcomes, ownership obligations and
test vectors are accepted. Existing source inspections inform that design;
they need not demonstrate an issuer that has not yet been implemented.
Concrete host adoption and external ordering are independently qualified later.

Before implementing a finalization port, specify its behavioral contract:

The [detailed finalization draft](finalization-port-contract.md) and
[selected executable outcome vectors](../reports/finalization-outcome-qualification.md)
now explore the control flow and recovery shape. They do not accept the complete
retained-input contract or qualify a host.

- It accepts only a trusted host-owned approved-record reference and resolves
  authoritative material inside the host boundary, not caller-selected facts.
- It revalidates all participating revisions/deadlines and both decisions,
  consumes the record once, and commits the complete Grant and verifier state
  at one linearization point. SDK validation must not become an unfenced precheck.
- It distinguishes rejection with no commit, confirmed commit, and unknown
  commit outcome. The host assigns a stable, non-authorizing issuance-attempt key
  to the approved record before finalization; one record has at most one attempt.
  Record consumption, Grant/verifier state and the attempt outcome are atomically
  indexed by that key. It is not a public capability or a caller-selected ID.
- On unknown outcome, prohibit delivery/retry and quarantine that attempt and
  approved record, not the whole principal or host. Reconcile by key through an
  authoritative read ordered after the original transaction has terminated.
  A missing row from a stale/read-replica snapshot does not prove no commit.
  Confirmed no-commit discards prepared secrets and closes the attempt without
  reusing old consent. Confirmed commit remains undelivered/frozen and requires
  confirmed revocation before replacement issuance. Unresolved state remains
  blocked; reconciliation never recovers or delivers the original secret.
  A new approved record requires fresh decisions. Broader blocking is justified
  only if the adapter cannot isolate the affected authority; its exact scope
  and availability cost must then be stated and qualified, not assumed global.
  The host tracks replacement lineage: a new reference or fresh consent cannot
  bypass quarantine of the authority it replaces. Unrelated records may proceed
  only when the adapter proves that isolation.
- Private post-commit delivery and its uncertain outcome remain a separate
  host/mediator lifecycle. Public results never expose the raw credential.
- The first non-live model uses host-owned authority revisions in one ordering
  boundary. This is a fixture topology, not a new identity profile or production
  trust root. External adapters require a concrete valid-through-commit mechanism,
  not an `active` flag, a TTL, or an interface promising safety by itself.
  Stage 1 must also model an external authority participating in the ordering
  boundary (or a provider-qualified validity guarantee), including loss of that
  guarantee before commit. The host owns acquiring/checking that guarantee;
  SDK validators receive retained inputs, not external-service callbacks.
  The sketch is a port-shape check, not qualification of any external provider.

These are design requirements, not exported method signatures or evidence that
the current SDK implements issuance. Responsibility roles are not substitutes
for authenticated end-user or issuer consent.

## Staged delivery

### Stage 1 — contract design and ownership

Begin with non-live design of ordinary principal authentication,
the two consent bindings, and commit/revocation fences. Resolve the owner matrix
above for the bounded same-host profile; do not assume Calcu can serve as the
live consumer. Specify the immutable record's material binding and invalidation
semantics, the issuance linearization point, external-source ordering obligations,
and post-commit delivery uncertainty state. Define dependency lifecycle,
retention/data minimization and test fixtures. Estimate reusable SDK engineering
separately from selected-host integration; set slice budget, stop conditions and named
exit evidence before coding. Accept the bounded finalization contract and
positive/negative vectors, including explicit fixture limitations. A missing
live adapter does not prevent this design or Stage 2. An incoherent contract
does: return to design rather than weakening the profile.
The current symbolic qualification scope and unresolved real-host dependencies
are recorded in the [non-live qualification report](../host-contract-qualification.md).
The [Stage 1 gate matrix](../reports/consent-issuance-stage-1-gates.md) now
separates design decisions from later implementation and host evidence; it does
not mark any stage complete.

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
and issuance. Report SDK and consumer effort separately. Integration evidence
does not authorize live activation. This slice does not itself qualify HTTPS Action admission,
revocation, sessions, or the whole Host-Provisioned Bearer binding.

### Stage 4 — live activation decision

Only after every required selected-profile dependency and applicable ADP gate
is satisfied may a separately authorized host activate issuance. Require actual
current Action admission/revocation, authenticated decisions, private custody,
all-writer ordering, external-authority guarantees and restart/delivery evidence.
SDK unit tests or an accepted contract cannot substitute for these proofs.
This development binding never implies production certification.

## Acceptance vectors

| Case | Expected result / evidence |
| --- | --- |
| Authenticated ordinary account + registered runtime; verified current identity; exact snapshot/policy; both independently recorded decisions; all revisions/deadlines valid | One complete Grant and verifier commit; record consumed once; credential delivered privately after commit. |
| Missing/expired auth, substituted user, generic cookie only, forged or unregistered runtime | Reject; no usable authority, no credential delivery. |
| Missing either decision, decisions collapsed into one, decision for changed preview, task text or receipt offered as consent | Reject; require fresh exact consent. |
| Identity unavailable/stale/inactive, unsupported profile, policy changed, snapshot/schema/request/projection changed or rehashed after consent | Reject at revalidation/commit; invalidate record; discard prepared secret; no repair/retry under old consent. |
| Deadline expires or external invalidation is ordered before/at commit; external ordering cannot be demonstrated | Reject at the serialized commit fence; no Grant/verifier commit or credential delivery. If a valid commit linearizes first, later change follows ordinary admission/revocation rules; test both orderings rather than requiring every race to reject. |
| Same record/reference issued concurrently or replayed after success | Exactly one commit/delivery eligibility; all other attempts reject with no duplicate credential. |
| Commit timeout / lost acknowledgement; outcome unknown | Quarantine the attempt and approved record by the stable attempt key; no delivery or retry. Independent records remain eligible only if their authority is isolated. Reconciliation stays blocked while the original transaction can still commit or the outcome read is non-authoritative. |
| Reconcile unknown outcome: authoritative no-commit / committed / unavailable | No-commit closes the attempt and discards secrets; fresh decisions are needed. Committed freezes the undelivered Grant and confirms revocation before replacement. Unavailable remains quarantined. No branch recovers the raw credential or remints under old consent. |
| New reference/consent attempts to replace quarantined authority; unrelated isolated record | Replacement remains blocked by host-owned lineage until reconciliation/revocation resolves it. An unrelated record proceeds only with demonstrated isolation; no implicit principal-wide or host-wide denial. |
| External authority shares ordering or has a provider-qualified valid-through-commit guarantee; guarantee lost/expired/unavailable before commit | The same finalization contract can admit only while the guarantee covers commit. Missing coverage rejects without commit/delivery; an `active` response plus ordinary expiry is insufficient. Unit modeling is not provider qualification. |
| Crash/restart around prepare, commit, or delivery; delivery timeout/uncertain acknowledgement | No pre-commit usable authority. Freeze committed-but-undelivered authority; confirm revocation before fresh consent/issuance. After restart, alternatively invalidate every pre-restart credential at every enforcement point. If neither can be guaranteed, block startup/issuance. No transparent remint/retry assumption. |
| Attempt to observe secret through browser, model/tool arguments, public response, logs, or persisted verifier store | Test demonstrates no raw credential exposure; credential state contains verifier hash only, while authoritative state retains the complete Grant and exact audience separately. |
| In-memory store passes unit vectors | Report unit behavior only; explicitly not durability, crash-recovery, external-ordering, or host certification evidence. |

## Stop conditions and exit report

Stop bounded SDK implementation if its selected contract leaves authentication,
distinct consent, invalidation ordering, consume+commit or private delivery
semantics undefined. Missing real-host evidence blocks integration/activation,
not explicitly scoped non-live SDK work. Stop a concrete host's activation if
it cannot demonstrate any required guarantee. Stop if
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
