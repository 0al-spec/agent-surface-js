# Host-owned proposal dispatch contract

Status: proposed bounded contract and next qualification plan, 2026-10-02 UTC.
Design only: no public types, execution module, consumer migration or new ASP
wire profile. Complexity: high; reasoning effort: high.

## Decision and user scenario

An app already has a function that calculates a result. Its ASP executor checks
the incoming request and connects that function to one declared proposal action.
If access is expired at the final sampled authorization time, or revoked before
the final lifecycle decision, the function must not start. This is not a promise
that physical function entry occurs before the wall-clock deadline: scheduling
can delay entry after the sample. If the function has already started, a later
cancellation cannot make that execution disappear or restore its consumed quota.

The host must own **one joint final operation**: current-state checks, quota
claim and synchronous function entry. A future SDK binding may supply validated
descriptions and input/output mechanics; it must not substitute cached authority
or split that final operation into independent `isAllowed()` and `run()` calls.
Names in this document describe obligations, not approved API signatures.

Keep the [P5-T9A no-go](../reports/admitting-handler-binding-qualification.md)
for public extraction. The next experiment is a private, real-host comparison,
not publication of the symbolic test model as an executor.

## Baselines and evidence limits

- [SDK #33](https://github.com/0al-spec/agent-surface-js/pull/33) merged as
  `3622dd82f6682c6e106f2505378236e0da52c616`: 52 private-model cases, with deliberately
  symbolic authority. Greeting is fixture reuse, not independent interoperability.
- [Calcu #20](https://github.com/SoundBlaster/Calcu/pull/20) characterized the old
  gaps; [#21](https://github.com/SoundBlaster/Calcu/pull/21) repaired them. Current
  consumer baseline: `3ae557dfbf5bf5973601155261c4f060ec3ee46e`.
  The pinned [repair report](https://github.com/SoundBlaster/Calcu/blob/3ae557dfbf5bf5973601155261c4f060ec3ee46e/docs/DISPATCH_INPUT_REPAIR.md)
  records 26 regression cases, two added real-HTTPS deadline cases and passing
  local gates; verify/coverage CI passed on the merged PR head.
- Calcu rechecks Grant expiry and the retained verifier-returned identity
  deadline immediately before entry. It does not establish ordering with
  external identity status writers. A verified deadline is not a promise that
  identity cannot be revoked until that deadline.
- ASP source lock remains `da550fde6f8be4ff0c1ded15524afb66c2912287`.
  [Architecture](../architecture.md) owns SDK responsibilities and the
  [ASP adoption backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md)
  owns ADP sequencing/status. This plan does not close ADP-05…09 or durable
  issuance gates and does not replace the [Memos issuance fence](memos-session-issuance-fence.md).

## Selected topology and boundary

One trusted Node.js process, one complete one-action proposal-only manifest,
synchronous non-persisted business function, in-memory Grant/session/quota state.
Calcu remains Compatibility Bearer over loopback HTTPS with development identity
and its existing server-only receipt path. No process replacement may inherit
old authority. No async handler, multi-action manifest, durable writes, signed
receipts, public issuer or production identity is selected.

```text
Agent adapter -> LocalBackend -> HTTPS -> application executor
                                            |
                       request / identity / Grant / schema / receipt checks
                                            |
                       host-owned final state check + quota claim + entry
                                            |
                                  native business function
                                            |
                       output / receipt / disclosure checks -> LocalBackend
```

The native app retains its own trusted route to business logic. The agent gets
only the mediator port, never the function, host store or an execution permit.
Neither handler registration nor preparation grants access.

## Ownership contract

| Concern | Owner and obligation |
| --- | --- |
| Raw transport and credential | Host authenticates the bounded raw request; credentials stay out of body, model, browser and diagnostics |
| Surface/action binding | Executor retains the trusted prepared snapshot and explicit action/mode/schema selection; authoring stays handler-free |
| Grant/session | Host owns the authoritative record and current lifecycle/generation; independent admission checks all selected tuple/hash bindings |
| Identity | Host verifier owns artifact/profile/status verification and finite freshness deadline; its status-writer ordering must be declared separately |
| Domain input and handler | App supplies domain rules and one explicit trusted synchronous function; retain an owned immutable input, not caller aliases |
| Final dispatch | Same host domain orders revocation, session rotation, retirement, cancellation and quota against function entry |
| Output and evidence | Executor validates output and produces existing receipts/disclosure; mediator independently checks correlation and echoed inputs |

The final call accepts only executor-retained internal context tied to that host
instance, retained record, exact request and selected snapshot. Caller-created
objects, casts, previous successful validators and `admitted: true` are not
authority. Any internal custody mechanism must be qualified against copied,
foreign-host, stale and reused references; its concrete representation remains
open. Do not expose a reusable `invokeHandler()` capability or let a request
choose the callback. A changed host/snapshot requires the selected fresh
authority transition, not relabelling an old binding.

## Ordering and failure semantics

1. Finish potentially re-entrant trusted parsing, verifier and domain-decoder
   work first. Preserve raw-input, Grant, tuple, schema, hash and Runtime Receipt
   prerequisites rather than replacing them with a symbolic tuple.
2. Sample trusted time as `t_dispatch`, the authorization linearization point
   **for deadline eligibility**, then reread current host retirement,
   record/session activity and generation after the clock callback returns.
   Reject unavailable/non-finite time, or Grant/retained verified-identity
   deadlines at or before `t_dispatch`. A sample strictly before both deadlines
   may pass even if wall time crosses a deadline during the remaining synchronous
   reads, quota claim or scheduling delay before physical function entry.
   Do not describe this as a no-start-after-expiry guarantee. The sample is not
   a transferable admission token: lifecycle, cancellation and quota checks
   below must still pass. The supported clock's rollback policy must be qualified
   before claiming reusable sampled-time semantics.
3. Include any claimed current identity-status guarantee in the same ordering
   domain. For an external source, specify revision/invalidation participation
   or the selected freshness semantics; do not claim instantaneous external
   revocation from a cache or repeated verifier calls. The current Calcu path
   provides its bounded verifier observation/deadline behavior, not that stronger
   guarantee. Unavailable evidence fails closed.
4. Check cancellation and available quota; claim one slot and enter the retained
   function with the owned input, without another callback or suspension between
   final reads and entry. An independent quota adapter with read/decrement calls
   is not sufficient. Re-entrant dispatch shares the same quota owner.
5. Validate and deliver the result afterward. Throwing handler, invalid output,
   receipt/disclosure failure or cancellation after entry consumes the attempt;
   do not refund, retry automatically or report zero execution. This does not
   define durable idempotency/recovery for side effects.

This sequence is only a synchronous trusted-process ordering claim. Worker
threads, external writers or a database need separately qualified coordination;
an ASP-only mutex cannot fence writers that do not participate. Trusted app code
is not sandboxed by SDK configuration. A handler returning a Promise has already
been called: rejecting it afterward does not prove it performed no effects.
No callback or suspension is permitted between the final sample and entry;
this preserves local writer ordering, not atomicity with physical wall time.
A stricter deployment deadline needs its own qualified execution semantics,
not a second clock callback moved after the state reads or an unbounded loop.

## Private experiment and measurable acceptance

Use the repaired Calcu baseline, not an additional toy authority system:

1. Map each proposed common mechanism to the actual executor prerequisite and
   final lifecycle/quota owner. Select the concrete single-process host contract
   above. List omissions and blockers before implementing a seam.
2. In a separately reviewed private candidate, connect the same business
   function using that host-owned final operation. Keep the actual LocalBackend,
   HTTPS, credential, identity, Grant, receipt and exposure path. No new exports
   or vendored consumer activation during comparison.
3. Run the existing Calcu cases on baseline and candidate. Add only missing
   observations from the table below; preserve rejection stage, entry count,
   quota and accepted-result behavior. Do not duplicate the whole CLI/UI suite.
4. Compare integration cost at pinned commits and issue a go/no-go report. Only
   a passing real-host candidate with demonstrated reusable benefit can propose
   P5-T9B public signatures; P5-T9C live adoption remains later.

| Scenario | Required observation |
| --- | --- |
| Prepare, wrong binding, copied/foreign/stale context | No issuance or function entry; no bypass reference escapes |
| Valid proposal through HTTPS | One entry and correlated result; all existing receipt/exposure checks retained |
| Grant/identity deadline at or before `t_dispatch`, non-finite/failed time | Zero entry and no quota consumption |
| Sample before deadline, wall time crosses it before physical entry | Sampled-time eligibility may pass; do not assert a physical-entry deadline guarantee |
| Revoke/rotate/retire/cancel before final entry | Zero entry; all relevant writers share the stated ordering domain |
| Identity revoked/unavailable during verification | Zero entry; distinguish observed status from unqualified later external changes |
| Last quota slot, recreated composition, recursive dispatch | At most permitted entries; quota cannot reset or be claimed twice |
| Caller mutation or domain decoding re-entry | Owned admitted input reaches function; caller remains mutable; final state reread |
| Throw/invalid output/Promise/cancel after entry | Entry and consumed quota remain recorded; no successful presentation or implicit retry |
| Host shutdown/replacement or selected snapshot change | Retained old execution references reject; new host needs fresh authority |
| Schema-valid output with substituted operands | Mediator still rejects; schema/hash alone does not prove domain truth or task meaning |

Physical source lines at Calcu `3ae557d`, including blanks/comments:
`executor.ts` 683; `localBackend.ts` 169; `calculation-declaration.ts` 58;
`manifest.ts` 328. These are inventory, not reducible overhead: they include
mandatory security and app-specific behavior. The actual native function
connection is still **one line**. The private SDK model is 267 lines and its
qualification file 490; neither replaces those live obligations.

Report before/after separately: SDK implementation, per-action declaration and
binding, host security/policy setup, app domain behavior, tests and any duplicated
validation. Measure required edits for an additional independently declared
proposal in a non-live fixture; do not relax the live one-action contract to
manufacture a savings claim. List which manual security decisions remain and
which glue was actually removed. Moving host obligations into SDK code is not
eliminating them; no arbitrary line-count target overrides safety.

**Stop public extraction** if this only wraps Calcu's one-line call, adds a
second admission path, depends on unqualified status writers or costs more
integration work without demonstrated reuse. Keeping the current native binding
is an acceptable result. The next deliverable is a source-backed mapping and
private comparison report, not a promised general executor.
