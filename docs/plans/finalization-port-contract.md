# Non-live finalization behavioral contract

Status: **draft; selected outcome vectors executable, not accepted for a public
API or live host**. Prepared 2026-10-04 UTC. Implements design detail for the
[issuance plan](consent-approved-request-issuance-slice.md), not a new protocol.
Normative requirements use the current [source lock](../../spec-lock.json).
The canonical ASP backlog still owns delivery status.

## Purpose and control flow

The host owns the transaction and invokes reusable SDK validators/derivation
inside its ordering boundary. The SDK neither starts a transaction around
unrelated callbacks nor authenticates facts supplied by its host collaborators.

```text
private authenticated host control path
  → host resolves owned approved record and its stable attempt key
  → host enters finalization boundary
      → resolve retained material and authoritative inputs
      → invoke pure SDK checks over those inputs, with explicit time
      → recheck revisions/deadlines and external coverage at commit
      → consume once + complete Grant + verifier + attempt outcome: one commit
  → known commit only: private mediator handoff
  → uncertain outcome: quarantine → authoritative reconciliation → close/revoke
```

Preparation outside this boundary is advisory. Retained material cannot change
between validation and commit; all writers affecting accepted revisions must
participate in the ordering contract. Pure validators perform no I/O, implicit
clock reads, mutable URL lookup or credential delivery. Constructors remain
inert. These obligations do not require a function-based public API: SDK objects
may expose deterministic behavior with explicit immutable dependencies.

## Input and ownership contract

| Input | Authoritative owner | Required binding |
| --- | --- | --- |
| Approved-record reference | Host control path/store | Resolve locally; copied ID, forged object or browser/model string is not authority. |
| Stable attempt key | Host store | Assign before attempting finalization; unique in that host/store namespace and bound to one record. One record has at most one attempt. The key is a recovery index, not authorization. |
| Exact retained material | Application/policy owners | Manifest/schema bytes, semantic request, derived projections and complete Grant must pass existing selected validators and exact hashes/bindings. |
| Principal, Runtime and identity | Host authentication/registration/trust owners | Current trusted facts, selected profiles, exact tuple, revisions and deadlines. Equality with expected values alone is not authentication. |
| Two decisions | Consent and issuer-policy owners | Independent authenticated local preview confirmation and issuer consent over identical retained material, actor/purpose/revision/deadline and withdrawal state. |
| Time and external coverage | Host authority collaborators | Explicit accepted time; authoritative revisions and provider-qualified ordering/validity coverage through commit. |
| Prepared credential/verifier | Trusted host/mediator custody | Selected CSPRNG/encoding/expiry; discard prepared secret on rejection. Only verifier credential state persists, alongside complete Grant/audience state. |

The attempt key, approved record and replacement lineage must survive according
to the selected recovery strategy. No caller may label a replacement as unrelated
to bypass quarantine. Stable means stable across recovery, not necessarily a
public deterministic hash of a reference. Object identity is insufficient for a
durable adapter, even though the non-live fixture uses it to model ownership.

The selected fixture models a linear replacement chain with one current head.
Creating a successor permanently supersedes its predecessor; replacing an
ancestor cannot fork a sibling, whether the head is approved, quarantined or
already resolved. Only a resolved current head can admit another replacement.
Each replacement shares the host-owned lineage, while independent approvals
create independent lineages. This is a bounded fixture strategy, not a new ASP
wire field or proof that a real adapter correctly classifies independent work.

## Three outcomes

| Outcome | What it proves | Allowed next transition |
| --- | --- | --- |
| Rejected, no commit | Authoritative failure before publication; no complete Grant/verifier commit | Close attempt, discard secret. Fresh decisions for a new approved record; never retry the original reference. |
| Confirmed commit | Atomic record consumption, complete Grant/verifier and outcome publication | Only then attempt private delivery to the exact registered mediator. Single-use and current admission remain independently enforced. |
| Unknown | Response loss/timeout cannot establish either outcome | Quarantine attempt/record and affected replacement lineage. No delivery, retry or remint. Reconcile by stable key. |

Timeout is not rejection. A transport failure does not roll back a transaction
that may still be running. The host must distinguish a known precommit rejection
from an unknown adapter outcome; do not convert every exception into no-commit.

## Reconciliation and quarantine scope

An authoritative outcome read must be ordered after the original transaction
has terminated. While it can still commit, even an empty authoritative snapshot
cannot close the attempt. Stale replicas, unavailable storage and missing
retained attempt metadata leave the outcome unknown.

- **Confirmed no-commit:** terminally close attempt and discard prepared secrets.
  Replacing the record requires fresh decisions; old consent cannot be retried.
- **Confirmed commit:** retain quarantine of undelivered authority and establish
  confirmed revocation before replacement issuance. Do not recover/redeliver a
  raw credential from reconciliation; the verifier cannot reconstruct it.
- **Still unknown:** remain quarantined. An automatic mint-again is prohibited.

The normal block scope is the attempt, approved record and replacement lineage,
not every task for the principal or host. Independent issuance may proceed only
if the adapter proves isolation. If that proof is unavailable, declare the
larger blocking scope and availability cost explicitly. Restart cannot silently
forget quarantine; qualify durable recovery or the RFC's all-enforcement-point
pre-restart invalidation alternative before activation.

## External-authority shape check

The first fixture assumes host-owned revisions in one synchronous ordering
boundary. An additional vector family supplies a symbolic external revision and
coverage interval through the explicit commit time. It admits when the assumed
ordering guarantee covers commit, and rejects absent, unavailable, drifted or
expired coverage. Validation uses the same host-controlled flow in both cases.

For a real provider, the host must acquire and hold an ordering participation
mechanism or qualify a guarantee that accepted evidence remains valid through
commit. A normal TTL or a signed `active` assertion alone does not establish
this. Host code handles provider I/O; SDK validation receives retained inputs.
The fixture's `ordered` label assumes that guarantee; it cannot prove a lease,
signature, trust root or invalidation protocol. Commit-time progression and
concurrent invalidations still require actual adapter tests.

## Executable evidence and remaining work

The [outcome qualification report](../reports/finalization-outcome-qualification.md)
maps selected vectors to this draft. Those tests complement, not replace, the
older [symbolic host qualification](../host-contract-qualification.md).

Before Stage 2 SDK implementation, accept the detailed retained-record format,
selected identity/consent input contract, complete Grant/verifier derivation and
typed rejection reasons. Before Stage 3/4, supply the actual authenticated host,
durable writer/fence adapter, authoritative outcome index, isolation/lineage,
secret custody, private channel and external-provider evidence. This document
does not accept those missing contracts or mark Stage 1 complete.
