# Non-live host contract qualification

**Status: symbolic vectors executed; real-host qualification remains open.**
Recorded 2026-09-30 UTC.
This record describes a bounded in-memory test model, not a real issuer,
authenticated host, durable authority store, runtime adapter, or conformance
result. It does not mark the broader Stage 1 gate complete or permit issuance
activation.

## Scope and source alignment

The model represents host-owned approved-record reference,
distinct consent records, revalidation, consume-once symbolic commit, invalidation
ordering, delivery uncertainty and restart choices. It creates no real Grant,
credential, authenticator, credential verifier, persistent transaction,
transport or user data; symbolic counters are not published authority.

The design follows the SDK's
[consent-bound issuance plan](plans/consent-approved-request-issuance-slice.md)
and the [pinned ASP Private Issuance and Exact Consent clause](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-private-issuance-and-consent).
That clause requires a host-owned approved-record reference, distinct exact
decisions, immediate revalidation, an issuance linearization point, ordering of
external invalidations, consume-once commit and post-commit private delivery.
This model explores selected transition shapes; it does not implement or
certify those host dependencies.

## Model assumptions and limits

The fixture binds **revision/deadline labels only** for principal, Runtime,
identity, policy, snapshot, schema, request and projection. It does not hold
actual material bytes or authenticate actors, and cannot prove that the real
host revisions faithfully bind immutable content, the principal/Runtime tuple,
or derived projections. Decision-kind and object-reference checks are symbolic;
they do not authenticate consent actors or establish user intent. TypeScript
types and fixture object identity are not security boundaries.

External ordering is represented for a symbolic identity source only; the model
does not qualify policy or every other authority as an external source. Its
synchronous interleaving hook explores deterministic before/after/reentrant
orderings, not database locking, async races, serialization, crash recovery, or
external-source fencing. Old-epoch invalidation is likewise a symbolic fallback,
not proof that every real enforcement point invalidates prior credentials.

Calcu remains a conditional consumer: the inspected demo boundary lacks ordinary
account authentication. This work must not add a calculator login simply to
make the fixture appear live. See the source scope and prerequisite in the
[plan](plans/consent-approved-request-issuance-slice.md).

## Implemented fixture behavior and vector coverage

The model is
[`tests/fixtures/host-issuance-contract-model.ts`](../tests/fixtures/host-issuance-contract-model.ts);
focused tests are in
[`tests/host-issuance-contract-qualification.test.ts`](../tests/host-issuance-contract-qualification.test.ts).
The following summarizes the implemented and tested model behavior. These tests
do not qualify a host dependency.

| Transition/vector | What the fixture test checks | Evidence boundary |
| --- | --- | --- |
| Successful symbolic commit, then separate delivery | Commit and verifier-eligibility counters move together once; acknowledged delivery is a later transition ([test](../tests/host-issuance-contract-qualification.test.ts#L36-L65)). | Counter/state ordering only; no Grant or credential is constructed. |
| Principal/Runtime unavailable; copied, JSON-copied, cast, or foreign reference | Rejects before symbolic commit; fixture reference must originate in the same instance ([test](../tests/host-issuance-contract-qualification.test.ts#L67-L99)). | Fixture lookup only, not host authentication or authorization. |
| Consent missing, swapped, foreign, copied, wrong-kind/material; pre- and postcommit withdrawal | Tests reject missing/mismatched symbolic decisions and precommit withdrawal including the before-linearization hook; committed/delivered withdrawal requires modeled revocation before fresh approval ([tests](../tests/host-issuance-contract-qualification.test.ts#L101-L201), [#L481-L504](../tests/host-issuance-contract-qualification.test.ts#L481-L504)). | Symbolic kind/reference/revision checks only; no authenticated actor or actual preview. |
| Each material revision drift and each deadline expiry before commit | Rejects and leaves commit/verifier/delivery counters unchanged ([tests](../tests/host-issuance-contract-qualification.test.ts#L203-L230)). | Revision/deadline label checks; no same-revision content mutation is represented. |
| External identity source unqualified, toggled before linearization, and explicitly assumed qualified | Unfenced/change-before-commit cases reject; the qualified case allows symbolic commit ([tests](../tests/host-issuance-contract-qualification.test.ts#L232-L268)). | The positive case assumes a boolean qualification; it does not establish a real ordering contract. Policy and other external sources are not modeled. |
| Invalidation before commit versus commit before invalidation | Precommit policy invalidation rejects; postcommit identity invalidation marks symbolic state for revocation and blocks delivery pending confirmation ([tests](../tests/host-issuance-contract-qualification.test.ts#L270-L308)). | Deterministic hook ordering only; postcommit Action admission/revocation is not implemented. |
| Duplicate promise scheduling and reentrant competing attempt | One synchronous record attempt commits; replay and deterministic reentrant attempt reject ([tests](../tests/host-issuance-contract-qualification.test.ts#L310-L351)). | Replay/interleaving evidence only, not asynchronous transaction concurrency. |
| Failure before linearization versus throw after linearization | Precommit injected failure leaves no symbolic publication; postcommit throw preserves counters and freezes uncertain state ([tests](../tests/host-issuance-contract-qualification.test.ts#L353-L395)). | No actual database error, process loss, rollback or recovery behavior is proven. |
| Uncertain delivery, retained-state restart, unsupported restart | Frozen authority blocks fresh approval until modeled revocation; delivery retry is rejected ([tests](../tests/host-issuance-contract-qualification.test.ts#L397-L479)). | Model lifecycle only; no real revocation confirmation or durable restart. |
| Old-epoch fallback after a retained restart | Invalidates consumed records across two prior epochs and keeps epoch invalidation distinct from confirmed revocation ([test](../tests/host-issuance-contract-qualification.test.ts#L506-L532)). | Symbolic invalidation only; no proof that every real enforcement point rejects pre-restart credentials. |

## Validation (2026-09-30 UTC)

Writer-reported validation: 38 focused qualification vectors; `npm run check`
reported 13 test files and 487 passing tests, with Hello-consumer and action-
authoring prototype checks passing; `npm run build`, `npm pack --dry-run`, and
`git diff --check` also passed. These are repository/model checks, not additional
host guarantees.

## Host contracts still open

This qualification does not close any of these real-host gates:

- Ordinary account authentication, User binding, session lifecycle, logout and
  revocation; plus trusted Runtime registration and its lifecycle.
- Independent identity verification/profile/status/freshness and an external
  invalidation-ordering contract; external policy and other sources need their
  own owner-qualified ordering too.
- Authoritative policy and immutable manifest/schema provenance; semantic
  binding to actual bytes, principal/Runtime tuple and derived projections.
- Authenticated ownership and lifecycle of both decisions, exact preview and
  material binding. Symbolic consent-withdrawal vectors do not qualify real
  actor authentication, durable lifecycle or application revocation.
- Durable serialization/fencing across all input revisions, record consumption,
  complete Grant/verifier state, crash recovery and competing transactions.
- Credential RNG/verifier handling, mediator-only custody, private delivery,
  uncertain outcomes, restart invalidation at all enforcement points, and
  current-state Action admission/revocation.

Accordingly, the tests cannot establish actual authentication, consent, identity
freshness, external-source fencing, durable atomicity, credential secrecy,
private-channel isolation, restart safety, SDK issuer behavior, or ASP
conformance. Keep ADP/task status and the SDK source lock unchanged.

## Evidence boundary

The tested counters and transitions qualify only the model's selected symbolic
contract shape. They do not certify exact material bytes, consent actors,
identity/policy source ordering, storage durability, credentials, private
delivery, real restart invalidation, live authority, or ASP conformance. Do not
mark the broader Stage 1 gate complete based only on these vectors.
