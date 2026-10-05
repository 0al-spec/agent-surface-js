# Consent-bound issuance — Stage 1 gate matrix

Status: **design incomplete; no reviewed host is qualified for live activation**.
Reviewed 2026-10-04 UTC. This is an evidence and owner-decision matrix for the
[consent-bound issuance plan](../plans/consent-approved-request-issuance-slice.md).

## Decision summary

The public SDK can validate selected offline manifest, schema, request, Grant
and attenuation representations. Receipt-pair checks are separate private
repository experiment evidence, excluded from the base SDK tarball and not a
public API or consumer dependency. The public validation behavior
does not authenticate any participant, record consent, establish current
authority, or fence issuance against concurrent host writers.

The bounded SDK contract is not yet accepted. Host integration gaps below are
separate from that design decision; they do not prohibit specifying or testing
SDK behavior with explicit non-live fixtures:

- **Calcu** is not a qualified principal source for this slice: the inspected
  demo uses process-local session state and a fixed demo subject, not an
  ordinary account/session lifecycle.
- **Memos** is a candidate for account/session adapter behavior, but
  the source-backed proposal still lacks owner approval and complete writer,
  route, consent, external-authority and credential-delivery contracts. Its
  SQLite experiments cover selected storage behavior, not a complete issuer.
- **SpecSpace** was considered as a single-operator host, but the inspected
  optional Basic-auth profile does not establish revocable account sessions or
  a shared issuance fence.

These are findings from the pinned inspections listed in the linked design
records, not claims about every deployment or current uninspected source tree.
The owner roles below identify responsibility for real deployment decisions.
They are not end-user consent, a security proof, or a requirement to appoint a
Memos maintainer before developing reusable SDK behavior. Do not assign host
authentication or authority ownership to the SDK. These gates concern the
selected Host-Provisioned Bearer binding, not every possible SDK profile.

## Gate matrix

| Boundary and accountable owner role | Current evidence | Host evidence state | Stage 1 design decision (not implemented-host evidence) |
| --- | --- | --- | --- |
| Ordinary User and exact session — selected host authentication/integration owner | Memos account/refresh-session records need exact-session route adoption and persistence/error qualification. Calcu's demo cookie is not an ordinary account session. | **Open** | Define trusted principal/session resolution, exact binding, deadlines and invalidation outcomes. Memos refresh-token mechanics are adapter-specific, not mandatory SDK internals. Generic process cookies or caller IDs cannot establish account authority. |
| Registered Runtime — deployment/runtime owner | No selected host registration lifecycle is qualified. | **Open** | Specify authoritative registration, exact binding and revocation ordering; define missing/substituted/expired/revoked and commit-race vectors. |
| Agent identity — trust/identity owner | SDK representation checks do not qualify a live verifier, trust root or status fence. | **Open** | Specify supported profiles, provenance, freshness and ordering obligations. First use host-owned authority in a non-live fixture topology; external sources require a concrete valid-through-commit mechanism before integration/activation. |
| Manifest, schemas and policy — application/policy owner | SDK content/hash checks exist; authoritative host selection and invalidation are unqualified. | **Partial** | Specify immutable sources, revisions and exact retained-byte checks at finalization; material changes invalidate pending approvals. |
| Local preview confirmation — consent UX/application owner | No real authenticated preview/withdrawal lifecycle is qualified. | **Open** | Specify actor, canonical preview, material/revision bindings, deadline, withdrawal and audit semantics; changed material requires fresh confirmation. |
| Issuer consent — issuer-policy owner | Symbolic decisions do not authenticate either actor. | **Open** | Specify a distinct authenticated decision for the same exact material and negative vectors. Task prose, login, one boolean or an Action Approval Receipt substitutes for neither decision. |
| Shared commit/invalidation fence — selected host storage and all-writer owners | Memos SQLite experiments cover subsets, not all routes/writers or external ordering. | **Partial** | Specify the finalization port's trusted reference, atomic revalidation/consume/complete Grant+verifier commit, linearization point and reject/committed/unknown outcomes. Define races/failure/restart vectors. No independent get/set or SDK-local mutex establishes host ordering. |
| Credential generation, storage and private delivery — key-custody/mediator owners | Real issuance/private delivery is not implemented; symbolic counters do not prove custody. | **Open** | Specify CSPRNG, encoding, expiry, verifier-only credential storage, complete Grant/audience retention and private post-commit delivery. Define leakage, ambiguous delivery, restart and no-remint vectors; passing implementation tests is not required to accept this design. |
| Current Action admission/revocation — application enforcement owner | Public offline checks and private receipt experiments do not prove current enforcement. | **Open for activation** | Record the downstream obligation to reject revoked/stale credentials at all actual enforcement points. Qualify those points in integration and require them at activation. |

## Stage 1 decision status

`Drafted` means requirements/sketches are recorded, but detailed contract and
vectors have not been accepted. `Accepted` requires an explicit review decision
with a linked contract/vector revision; no row is accepted by this report.
These are local design decisions, not duplicate ADP delivery statuses.

| Decision covering the obligations above | Status | Review material / remaining decision |
| --- | --- | --- |
| Principal, Runtime, identity and policy inputs | Drafted | Define closed trusted-input bindings and lifecycle vectors; select supported profile combinations for the fixture. |
| Retained material and both consent decisions | Drafted | Define the exact immutable record and actor/material/revision bindings, including withdrawal. |
| Host-controlled finalization and pure SDK validation | Drafted | [Behavioral boundary](../plans/consent-approved-request-issuance-slice.md#sdkhost-boundary-for-the-next-implementation-decision); review atomicity, explicit time and rejection outcomes. |
| Attempt identity, reconciliation and delivery lifecycle | Drafted | Review stable attempt-key custody, authoritative outcome reads, per-record quarantine and replacement-after-revocation vectors. |
| Local/external topology and bounded test scope | Drafted | Review both the one-boundary fixture and external-ordering/valid-through-commit sketch; retain separate concrete-provider qualification. |

The [detailed finalization draft](../plans/finalization-port-contract.md) now
specifies host control, the outcome index and quarantine/reconciliation shape.
[Selected executable vectors](finalization-outcome-qualification.md) explore
those decisions with honest non-live assumptions. The rows remain `Drafted`:
tests are not acceptance of the remaining identity/consent/material contracts
or qualification of real host/provider guarantees.

## Stage 1 exit rule

Stage 1 completes when the bounded behavioral contract, responsibility split,
fixture topology, failure semantics and positive/negative vectors are reviewed
and accepted. Specify every design obligation in the last column, including
the finalization port described in the plan. Unresolved contract semantics block
implementation of that behavior; missing concrete-host evidence does not.
All rows in the design-status table must be accepted with review references;
accepting the requirements alone is not acceptance of the detailed contract.

`Open` and `Partial` above describe host evidence, not Stage 1 exit status.
They remain visible without requiring Stage 2/3 results before Stage 1 can exit.
Memos adoption, named deployment approval and a working credential channel are
not prerequisites for a bounded SDK implementation with honest fixtures.

## Downstream evidence and activation gates

1. **Stage 2 — SDK implementation:** test the accepted contract, complete
   Grant/verifier material, consume-once behavior and rejection/unknown outcomes.
   Fixtures must be labeled non-live/non-durable; their success is not evidence
   of real authentication, secret custody or external ordering.
2. **Stage 3 — concrete adapter:** qualify actual principal/runtime/identity
   sources, both decisions, all writers, durable atomic commit, secret generation,
   private delivery, leakage, concurrency, failures and restart. SDK and adapter
   evidence are reported separately. No particular application or database is a
   generic SDK dependency; a selected adapter must fulfill the whole contract.
3. **Stage 4 — activation:** require all applicable profile/ADP dependencies,
   including current Action admission/revocation, and separate authorization.
   Every external authority must share commit ordering or provide a qualified
   valid-through-commit guarantee. Without either, that topology cannot activate;
   cached `active`, future expiry or a local transaction cannot substitute.

## Non-claims

This planning report neither changes RFC guarantees, source-lock contents or
ADP status, nor approves an exported API, consumer migration or live credential
delivery. It records design requirements and limited evidence, not an implemented
issuer, authenticated decisions, durable host qualification, full conformance
or production certification. Deployment-owner approval remains mandatory for
real integration/activation; bounded SDK design review is a separate decision.

## Evidence references

- [Consent-bound issuance plan](../plans/consent-approved-request-issuance-slice.md)
- [Non-live symbolic qualification](../host-contract-qualification.md)
- [Host authentication/adapter selection](../plans/host-auth-adapter-selection.md)
- [Memos session/account fence design and writer map](../plans/memos-session-issuance-fence.md)
- [SDK/host responsibility boundary](../plans/consent-approved-request-issuance-slice.md#sdkhost-boundary-for-the-next-implementation-decision)
- [Host-provisioned binding implementation matrix](../compatibility/host-binding-implementation-matrix.md)
