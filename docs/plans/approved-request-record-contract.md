# Approved-request record — bounded storage contract candidate

Status: **candidate for Stage 1 review; not accepted, implemented, or an ASP
wire format**. Prepared 2026-10-05 UTC. This narrows the unresolved retained-
record decision in the [issuance plan](consent-approved-request-issuance-slice.md)
and [finalization behavior draft](finalization-port-contract.md). Requirements
remain those in the exact pinned ASP source lock.

## Purpose

The host must be able to answer one question at finalization: “Are these still
the exact facts and decisions the user and issuer approved, and can they be
consumed atomically with the resulting Grant?” The record is private host state
for that lifecycle. It is neither an ASP message nor an SDK capability, and
possession of its reference alone grants no authority.

This candidate intentionally defines logical groups and lifecycle behavior,
not a database schema, TypeScript classes, wire names, or a new digest profile.
An adapter may normalize the groups to its storage model if it preserves the
invariants below.

## Record groups

| Group | Retain | Binding and rule |
| --- | --- | --- |
| Host identity | Unpredictable host-owned record reference, host/store namespace, current record revision, lifecycle state | Resolve only through the authenticated private host path. A copied or guessed reference is not authentication, consent, or authority. |
| Approved material | Exact semantic request; selected manifest and schema snapshot; effective policy; requested actions/scopes/constraints; independently derived identity and exposure projections; canonical local preview material and issuer consent-view material | Keep immutable bytes or references to immutable, content-addressed versions. Each reference must resolve to the exact bytes validated. If the backing store cannot guarantee immutability and availability for the required period, retain the bytes locally. Reuse only hashes and canonicalization rules already defined by the selected ASP profile; do not invent a record hash or treat a host revision as a cryptographic proof. |
| Authority observations | Host-owned User reference and exact session reference/generation; registered Runtime reference/revision; identity evidence tuple and retained verification result/reference; policy and snapshot revisions; their deadlines and source owners | References identify the authoritative source to re-resolve inside the host fence. Record the versions/freshness accepted at preview so drift is detectable. A cached “active” result or stored revision is not a current authorization decision. Never copy session credentials into the record. |
| Local decision | One authenticated local Consent Preview decision | Bind to the approved material revision and exact locally displayed canonical preview; record decision outcome, authenticated actor reference, decision time, expiry/deadline, and withdrawal/revocation state/version. The actor must be the User bound to this record, or a delegate whose authority to consent for that User is independently verified by host policy. |
| Issuer decision | One separately authenticated Grant Issuer consent decision | Bind to the same approved material revision and the issuer's own verified consent view; record its authorized actor/policy authority, outcome, decision time, expiry/deadline, and withdrawal/revocation state/version. The actor or policy authority must be authorized for this issuer and application. It remains a separate decision even when one UI presents both views. |
| Finalization attempt | Host-generated stable attempt key, approved-record reference/revision, replacement-lineage reference, attempt state and finalization outcome | Assign once before entering the finalization boundary. It is an idempotent recovery index, never a caller-selected capability. A record has at most one attempt; unknown outcome quarantines the affected record and lineage until authoritative reconciliation. |
| Committed authority | Complete Agent Grant and exact complete hashing view; exact credential audience; verifier-only credential state; delivery state/reference | Commit atomically with record consumption and attempt outcome. Keep the complete Grant/hash view for the Grant lifetime and required audit-retention period. Never persist or log the raw credential in this record. |

The internal “approved material revision” above means a host-controlled version
of the exact immutable material group, not a new ASP member. Local and issuer
consent views can differ in presentation; each decision binds to its own exact
view while both refer to the same approved material revision. Human-readable
labels are display aids, not authority. The local decision's actor binding
must resolve to this record's authenticated User or verified delegated
authority; the issuer decision must resolve to the issuer's authorized actor
or policy authority. Do not infer that the two decision makers must be
different people unless the selected deployment policy requires it.

## Minimize retained data

- Do not retain the user's natural-language task, arbitrary UI transcript,
  model output, or unrelated application data as authority evidence. Retain
  such text only if a separate, explicit host product function needs it and
  defines its own purpose and retention policy; it never substitutes for
  either consent decision.
- Do not retain raw login/session credentials, the raw issued bearer after
  private delivery, signing keys, or reusable provider secrets. The one-time
  raw bearer exists only in trusted generation/delivery custody; durable
  credential state contains its verifier hash.
- Retain only the identity evidence or immutable evidence reference needed to
  re-establish the selected verification result and its profile tuple. Apply
  the RFC's privacy minimization to Passport names, UIDs, capabilities and
  local integrity details; retain full identity projections where required by
  the complete Grant.
- For a pending record, exact material must remain resolvable until it is
  finalized or terminally invalidated. For a committed Grant, retain the
  complete Grant, complete hash view, audience, required audit evidence and
  unresolved recovery/revocation data for their applicable required periods.
  No local duration is introduced here. A tombstone or lineage/outcome index
  must outlive deletion of bulky material whenever needed to prevent replay,
  unsafe replacement, or loss of an unknown commit outcome.
- Once no applicable lifecycle, audit, recovery, or revocation rule needs a
  material reference, the host may delete or redact it under its declared
  retention policy. It must not remove evidence while using the record as
  current authority or while the finalization outcome is unknown.

## State and invalidation

```text
prepared → approved → finalizing
                       ├─ rejected/no commit → closed
                       ├─ confirmed commit   → consumed → delivery pending → delivered
                       └─ unknown            → quarantined → reconciled

prepared --either decision denies--> denied/closed
prepared/approved --material, authority, expiry, or consent drift--> invalidated
```

The host may use different persisted labels, but must preserve these transitions:

1. `prepared` becomes `approved` only if both distinct decisions are
   authenticated, affirmative, unexpired, not withdrawn, correctly actor-bound,
   and bound to the same exact approved material revision. A denial by either
   decision-maker terminally closes the record as denied; two valid denials
   never satisfy the approval guard.
2. Before commit, any change to a bound input or its accepted revision,
   unavailable required authority, expired deadline, or withdrawn decision
   terminally invalidates this record. The host creates a new record and gets
   fresh decisions; it never repairs this record or reuses its consent.
3. The finalization boundary resolves all references, recomputes the selected
   profile's exact bindings, and rechecks that both decisions remain
   affirmative, unexpired, not withdrawn and correctly actor-bound. It invokes
   deterministic SDK validation with explicit time and orders all relevant
   invalidation writers through the commit point. One commit consumes the
   record and writes complete Grant, verifier-only credential state, audience,
   attempt outcome, and delivery-pending state.
4. A known rejection writes no usable Grant or verifier. An uncertain result is
   quarantined under the preassigned attempt key; neither delivery nor retry is
   allowed until an authoritative outcome read is ordered after the original
   transaction terminates. Confirmed commit requires revocation before a
   replacement; confirmed no-commit closes the attempt and still requires a
   new record and fresh decisions.
5. Delivery occurs only after confirmed commit through the private channel to
   the exact registered mediator. If delivery fails or its outcome is
   uncertain, freeze use and follow the selected revocation/recovery contract;
   never remint under the old decisions.

Record reference, attempt key and lineage are lookup aids only. The host must
authenticate the control path, establish ownership, and resolve the referenced
state authoritatively. A new reference cannot evade the old record's quarantine
when it represents replacement authority.

## Review decisions this candidate makes

1. Use immutable references when the host can guarantee exact-byte resolution;
   otherwise retain exact bytes. Do not trust mutable URLs or reconstruct
   material from current convenience objects.
2. Bind both decisions to one host-controlled material revision, but preserve
   each decision and its view independently. Do not collapse them to booleans.
3. Keep consent, attempt/reconciliation, and committed authority as distinct
   lifecycle groups so their retention and invalidation rules are explicit.
4. Keep natural-language task text and raw credentials out of authority state
   by default; do not add a synthetic `task_hash` or record-wide hash to suggest
   semantic consent or cryptographic authority.
5. Keep concrete retention durations, actor separation rules, storage layout,
   and external-provider mechanisms deployment-owned. They need an explicit
   policy/evidence decision before implementation; this candidate does not
   silently choose them. Actor binding to the record's User and issuer-policy
   authority is required; whether those actors must be different remains a
   deployment-policy decision.

## Required negative vectors

- Local decision denies; issuer decision approves → denied/closed, no finalization.
- Issuer decision denies; local decision approves → denied/closed, no
  finalization.
- Both decisions deny → denied/closed, never `approved`.
- Local actor belongs to another User and has no verified delegated authority,
  or issuer actor/policy is unauthorized → reject before approval.
- Either decision expires or is withdrawn after approval but before commit →
  finalization rejects with no Grant/verifier commit; old consent is not reused.
- Delivery has a known failure after commit, or an unknown outcome → freeze
  use and require confirmed revocation/recovery before replacement; never
  remint from the same record.

## Acceptance and remaining gates

Accepting this candidate would settle the bounded record semantics for Stage 2
design only. It would not approve public SDK API, complete all Stage 1 decisions,
qualify Memos/Calcu or another host, prove crash durability, authorize live
issuance, change RFC text/source lock, or close ADP items. Stage 1 still needs
review of the selected identity and consent inputs, complete Grant/verifier
derivation, typed rejection reasons, and positive/negative vectors against this
record lifecycle. A concrete adapter must separately prove every writer and
invalidation source participates in the finalization ordering boundary.
