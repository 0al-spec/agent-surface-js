# P5-T9A — Private dispatch qualification

Date: 2026-10-02 UTC. Decision: **no-go for public extraction or live adoption**.
This completes the bounded experiment in the [plan](../plans/admitting-handler-binding.md),
not implementation of a new SDK executor. No source-lock, export, wire contract,
consumer archive, RFC maturity or ADP status changes.

## What ran

- [Private model](../../tests/fixtures/proposal-dispatch-model.ts): real retained
  one-action manifest provenance, schema checks, strict bounded JSON, ASP input
  and output hashing, immutable domain input and one explicit synchronous handler.
- [Qualification tests](../../tests/proposal-dispatch-qualification.test.ts):
  52 cases, including a separate greeting proposal with its own complete manifest.
- [Calcu characterization](https://github.com/SoundBlaster/Calcu/pull/20):
  11 new cases against the unchanged production executor at the merged
  `ee4681f1df73a75611a9c348162714a5b750c7cb` baseline. Existing boundary and live
  activation tests remain the credential/Grant/receipt/HTTPS evidence.

The fixture intentionally models authority with a host-owned WeakMap and opaque
object custody. Its tuple is a **symbolic projection**, not a Grant; its request
is a **test envelope**, not an additional supported ASP wire contract. It has no
credential verifier, identity artifacts, semantic Grant verifier, Runtime/App
Receipts, transport, authenticated result delivery, durable store or production
principal/consent policy. Missing obligations are not supplied by a boolean,
structural cast or successful offline validator. Do not call this fixture an
ASP-conforming executor or count greeting as independent interoperability.

## Shared scenario comparison

These are shared scenario categories, not byte-for-byte request parity. Calcu
tests use its actual LocalBackend request/receipt path; the private model uses
the smaller explicitly symbolic envelope above.

| Scenario | Unchanged Calcu observation | Private model observation |
| --- | --- | --- |
| Valid `240 × 0.15` | One engine entry, correlated `36` | One entry, schema-valid output `36` with matching input hash |
| Re-entrant revoke, rotate, retire, cancel | Zero entries | Zero entries after final state checks |
| Grant deadline reached inside verifier | **One entry**; next request rejected | Zero entries with fresh dispatch-time clock |
| Identity freshness elapses inside verifier | **One entry**; next request rejected | Zero entries with current freshness check |
| Caller changes its input during verifier | Original operation executes; mediator rejects presentation against changed caller object | Captured input stays immutable; caller remains mutable |
| Last quota slot/recreated composition | At most three baseline engine entries; recreated mediator cannot reset state | Shared host quota survives prepared compositions; recursive competing entry cannot claim the same slot |
| Invalid output/business failure | Function already entered; no quota refund | Entry retained; schema/error rejection does not refund or retry |
| Cancellation after entry | No accepted successful result, entry retained | No returned result, entry retained |
| Malformed/wrong tuple/action/mode/hash | Existing boundary suite rejects before another engine entry | Model rejects before entry; this is not coverage of omitted Calcu obligations |

The model also shows a deliberate limit: a shape-valid output with changed
operands can pass its output schema and hashing checks. Calcu's mediator must
still independently reject that response. Generic schema validation cannot
infer application correlation rules or establish mathematical truth. This is
not a replacement for LocalBackend or a new verified-result UI path.

## Dispatch point and host ownership

`FixtureDispatchDomain.dispatch()` checks current authority, generation/tuple,
deadline, identity state/freshness, retirement, cancellation and quota, decrements
quota, records entry, then directly calls the captured behavior. No verifier,
decoder or clock callback occurs between those reads and function entry.
Verifier hooks and trusted domain decoding run **before** this step and can
re-enter lifecycle operations; the tests confirm a fresh decision afterward.

That works because the fixture domain owns all simulated writers and an
internally controlled clock in one synchronous process. It does **not** prove
that separate `get`/`set` callbacks, an external identity service, database,
async handler, another writer or another process share this fence. A future
host adapter must specify and qualify that joint operation rather than expose
an unrestricted `invokeHandler()` or an `admitted: true` flag. Trusted callbacks
are not sandboxed; no runtime check proves declared side-effect behavior.

## Cost observation

Physical line counts (`wc -l`, including comments and blanks) at this experiment:

| Category | Count / observation |
| --- | --- |
| Private SDK/model engineering | 267 lines, including symbolic host state and common boundary helpers |
| SDK qualification tests and fixture composition | 490 lines |
| New Calcu characterization tests | 210 lines |
| Calcu production changes/migration tests | **0** production lines changed; no migration attempted |
| Current native handler connection | `const output = calculate(input);` — one line after separately owned admission |
| Per-action candidate connection | Explicit selection, decoder, handler and preparation; see both test compositions |
| Host/policy setup | Still mandatory and application-owned; the symbolic fixture is not a cost estimate for real setup |

Reuse across arithmetic and greeting proves absence of arithmetic coupling in
the private seam. It does not prove lower real integration cost. The candidate
adds a second admission composition while removing no production code. Copying
Calcu's full executor into the SDK would hide ownership rather than demonstrate
a reusable mechanism; comparing all 661 executor lines against this incomplete
model would be misleading.

## Decision and next bounded work

**No-go for P5-T9B/C now.** Keep the candidate test-only and existing authoring
handler-free. The experiment found actionable baseline gaps without establishing
a cost reduction or a qualified real host-state adapter.

1. In a focused Calcu repair, re-read Grant and verified-identity deadlines at
   dispatch, including a second lifecycle/generation/cancellation check after
   the trusted clock callback. Replace the known-gap characterizations with
   zero-entry regressions. Do not recursively rerun the identity verifier as
   an unbounded substitute for a defined freshness/authority contract.
2. Snapshot LocalBackend's domain input rather than retain the caller's mutable
   object for response comparison. Preserve caller ownership and existing
   correlation/receipt verification; characterize asynchronous caller mutation.
3. If extraction is still useful, design a bounded host-owned dispatch contract
   and a concrete cost comparison before choosing public SDK signatures. Full
   credential, identity, Grant, receipt and transport obligations stay explicit.

Local checks and CI state are recorded in the companion PR descriptions. The
known-gap tests assert actual insecure baseline behavior; green tests do not
certify that behavior as acceptable. Live code remains unchanged in this stage.
