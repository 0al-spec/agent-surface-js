# Finalization outcome qualification

Recorded 2026-10-04 UTC. **Private test-fixture evidence only.** The
[behavioral contract](../plans/finalization-port-contract.md) is draft, not an
exported SDK API or qualified live issuance path.

## Test scope

[`NonLiveFinalizationHost`](../../tests/fixtures/finalization-outcome-model.ts)
models host-controlled invocation of a pure symbolic binding validator,
single-use attempts, lost responses, pending transactions, authoritative/stale
reconciliation, replacement quarantine and assumed external coverage.
The model stores no real Grant, credential or verifier and performs no I/O.
It is compiled/tested with repository tests, excluded from the base SDK tarball.

The older symbolic fixture binds revision/deadline labels across more authority
categories. This smaller model specifically explores uncertain commit outcomes;
neither fixture constitutes a complete issuance implementation.

## Vector matrix

Test IDs are labels in
[`finalization-outcome-qualification.test.ts`](../../tests/finalization-outcome-qualification.test.ts).

| ID | Scenario | Required observation |
| --- | --- | --- |
| F01 | Known commit + separate handoff | Host enters boundary, invokes validator, symbolically commits, leaves boundary; delivery only afterward and at most once. Replay rejects. |
| F02 | Pure validation | Repeated explicit immutable inputs have the same result and remain unchanged. No clock/I/O is used. |
| F03 | Local-preview or issuer binding drift | Rejected with no symbolic commit/delivery. |
| F04 | Copied/foreign reference or copied attempt key | Cannot select an approved record. Object lookup is a fixture assumption, not authentication. |
| F05 | Lost reply after commit | Stable key, frozen committed result, no delivery/retry/replacement until modeled confirmed revocation; fresh record receives a new key. |
| F06 | Lost reply before commit | Authoritative no-commit closes old attempt; cannot retry it. Replacement uses fresh symbolic decisions. |
| F07 | Stale or unavailable outcome read | Quarantine remains; replacement rejects. |
| F08 | Transaction still pending, then settles either way | Early read stays unknown; later no-commit closes or commit remains frozen. No recovered delivery. |
| F09 | Independent record during quarantine | Fixture-declared independent record proceeds; affected replacement remains blocked. Real isolation is not proven. |
| F10 | Assumed external ordering coverage | Same finalization flow accepts the matching retained revision with coverage through explicit commit time. |
| F11 | Missing/unfenced/unavailable/drifted/expired external coverage | Reject before symbolic commit and delivery. |

## Non-claims and open gates

Symbolic material/consent strings are not real retained bytes, hashes, identity
or authenticated decisions. The paired-commit trace is not complete Grant/verifier
storage. Synchronous in-memory transitions do not prove durable atomicity,
independent writer races, cancellation, restart recovery or an authoritative
database read. External coverage is an explicit assumption, not a qualified
provider. Approval/replacement fixture methods assume host ownership of fresh
decisions and isolation; arbitrary application callers must not receive them.

No credentials, CSPRNG, verifier, private mediator channel, current admission,
production trust root or live authority are implemented. There are no new
public exports, normative/source-lock changes, ADP status advances or completed
Stage 1 claims. Detailed input contracts and actual adapters remain open.

## Running the vectors

```sh
npx vitest run tests/finalization-outcome-qualification.test.ts
```

`npm run check` includes these vectors through normal Vitest discovery, so both
Node versions in the existing CI matrix execute them. No separate workflow or
Memos live test is needed for this non-live slice.

Local validation on 2026-10-04 UTC: 19 focused vectors passed; the full check
passed 16 Vitest files / 645 tests, consumer suites and 704 private
proposal-exchange tests. Build, package dry-run and whitespace checks passed.
After narrowing the fixture's exception handling to prepublication checks,
the 19 focused vectors passed again. These counts describe repository tests,
not live-host or provider qualification.
