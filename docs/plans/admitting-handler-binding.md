# Admitting executor to application handler binding

Status: private qualification completed, 2026-10-02 UTC; no-go for public
extraction/live adoption. See the [report](../reports/admitting-handler-binding-qualification.md).
No new exports or live behavior.
Follow-up: Calcu #20/#21 and SDK #33 have merged. The
[host-owned dispatch contract](host-owned-proposal-dispatch.md) pins the repaired
consumer, scopes the next private real-host comparison and keeps P5-T9B/C gated.
The initial baseline mapping below remains historical, not current Calcu state.
The [architecture](../architecture.md) owns component responsibilities; the
[ASP adoption backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md)
owns ADP status and cross-repository ordering. Follow the
[API principles](../api-design-principles.md) and
[EO policy](../engineering/elegant-objects.md).

## Trigger and observed boundary

[Calcu #19](https://github.com/SoundBlaster/Calcu/pull/19) merged as
`ee4681f1df73a75611a9c348162714a5b750c7cb`. It activates one SDK-authored
`calculation.propose` description, bound to surface `0.1.2`. Its
[report](https://github.com/SoundBlaster/Calcu/blob/ee4681f1df73a75611a9c348162714a5b750c7cb/docs/LIVE_SDK_MANIFEST_ACTIVATION.md)
records a 45-line description reduction and 242-line net production increase
at the activation baseline. Those measurements exclude later UI styling and
do not establish savings from a general executor.

The authoring module produces immutable descriptions and schemas. Calcu still
owns the admission sequence and calls its existing arithmetic function directly
after the final authority/cancellation/quota checks. The next question is
whether a narrow typed handler binding can preserve that sequence while
reducing repeated application integration work.

Scenario: an app already implements multiplication. An integrator binds its
function to an explicitly declared action once. A stale Grant fails before
that function runs; a successful invocation returns a correlated, validated
application result. Preparing the binding invokes no function and grants no
authority. The native application's own trusted route remains usable.

Initial source mapping at the merged Calcu baseline:

| Current executor stage | Existing behavior | Extraction constraint |
| --- | --- | --- |
| Credential/record lookup | Private credential verifier, active session and initial clock/expiry check | Host supplies authoritative state; no default issuer or reconstructed record |
| Raw request decoding | Byte bound, strict JSON and exact envelope/payload fields | Preserve the raw-input boundary before conversion |
| Identity and Grant integrity | Current verifier result, freshness, semantic-request/selected-Grant validation and hashes | Valid offline objects do not establish current identity or authority |
| Tuple and action selection | Current session generation, exact binding, credential profile, action and mode | Derive expected values independently from trusted state |
| Schema/hash/receipt checks | Manifest input validation, domain validation, input/execution hashes and Runtime Receipt binding | Preserve every prerequisite before dispatch |
| Final dispatch block | Retirement/active/cancellation checks, quota decrement, then `calculate(input)` | Identify which fresh reads must accompany this point before making a reusable seam |
| Result production | Output validation, App Receipt and disclosure projection | Rejection here is after function entry, not zero execution |

This is code mapping, not new passing evidence. In particular, expiry and
identity freshness use the initially captured clock, while the final dispatch
block rereads retirement/active state and cancellation. The proposed clock
advancement case must characterize that distinction before extraction; do not
assume that all final-state scenarios already pass.

## Selected scope

Keep the SDK source lock at `da550fde6f8be4ff0c1ded15524afb66c2912287` and the
existing one-action complete-manifest contract. First qualify a synchronous,
non-persisted proposal handler with the existing schema/input/output behavior.
Preserve the public authoring module's handler-free contract. Any executable
binding belongs to a separately selected server execution composition.

Calcu's live contract remains Compatibility Bearer over loopback HTTPS with
application-owned ephemeral identity, per-task authority and in-memory state.
That bounds the experiment; it does not satisfy durable ADP-07 obligations.
No multi-action manifest, async business handler, side-effecting stage, general
store framework or automatic method discovery is selected here.

## Ownership and dispatch invariants

| Concern | Proposed SDK mechanism | Host/application input and responsibility |
| --- | --- | --- |
| Description binding | Check action ID, mode, exact prepared snapshot and schema correspondence | Curate the action and choose the trusted snapshot |
| Handler connection | Capture one explicit narrow callback; validate input/output using the selected contract | Supply existing business behavior and domain checks |
| Admission | Qualified reusable mechanics only if the current-state seam is sufficient | Own credential custody, principal/consent, identity policy, Grant/session state and quota |
| Dispatch point | Keep final current-state checks, quota claim and callback entry in one qualified sequence | Supply state/fencing semantics; do not infer them from a `get`/`set` adapter |
| Result handling | Preserve correlation, input/output integrity and rejection stage | Own disclosure policy, receipt production and effect reconciliation |

Do not accept an agent/browser-supplied approval flag, a caller-made
`AdmittedAction` object or a TypeScript cast as authority. A prior successful
validator call cannot substitute for the executor's independent current-state
decision. No public unrestricted handler invocation handle should be returned
by description preparation or given to the agent adapter.

The qualification must identify the dispatch linearization point: the moment
current authority is checked and quota is claimed before callback entry.
Recheck Grant expiry, generation, revocation, retirement, cancellation and
current identity status/freshness there; an unexpired Grant does not extend
identity freshness. Qualify the identity-only deadline case separately from
Grant expiry, including synchronous verifier/policy clock advancement.
Synchronous verifier/policy callbacks can re-enter the host or advance the
test clock; absence of `await` alone is not a correctness argument.

Keep caller input captured and validated against the admitted snapshot, with no
mutable object shared between admission and the callback. Record quota behavior
for handler failure, invalid output and cancelled delivery; do not silently
refund or retry. Output/receipt rejection after callback entry means execution
occurred, even when no successful result is presented.

The host deliberately supplies trusted code. This binding is not a sandbox
against a malicious callback or dependency in the privileged process, and types
cannot prove that the callback obeys its declared effects.

## Qualification before a public API

1. Characterize Calcu at the pinned merged baseline. Map every current admission
   obligation, its owner, rejection stage and observable handler counter.
2. Build a private contract fixture for the smallest proposed seam. Compare its
   outcomes with Calcu using shared cases; no public export or Calcu migration.
3. Exercise a separate non-arithmetic proposal fixture under its own one-action
   complete manifest. Check for domain coupling; this is fixture reuse evidence,
   not a second live implementation or interoperability result.
4. Review the measured cost and state seam. Only a passing candidate with a
   justified integration reduction becomes a separately reviewed public module
   and subsequent Calcu consumer migration.

| Case | Required observation |
| --- | --- |
| Prepare, incomplete/mismatched binding | No callback entry; failed preparation returns no executable composition |
| Valid proposal | One callback call, matching input/output and unchanged authority/receipt bindings |
| Wrong action/mode/hash/tuple or malformed raw input | Admission rejects with zero callback calls |
| Expired/revoked Grant, stale generation or unavailable identity | Admission rejects with zero callback calls |
| Re-entrant retirement/revocation or clock advancement | Final dispatch checks reject invalid current state, including identity-only freshness expiry with a still-valid Grant, with zero callback calls |
| Concurrent last quota slot or recreated mediator | At most the governing permitted calls; no quota reset |
| Input mutation during admission/preparation | Callback receives only the immutable admitted input |
| Invalid output/forged result/cancelled delivery | No successful presentation; count any callback already entered |
| Failed cleanup or host replacement | Old references remain fenced; fresh host requires fresh authority |
| Packaging and model/browser imports | No agent-facing callback bypass or authority-bearing client artifact |

Reuse existing Calcu boundary and lifecycle vectors. Add only cases needed to
observe the proposed seam; do not multiply the full transport/process suite in
the SDK fixture. Later live adoption must still traverse the actual HTTPS path.

## Decision and stop criteria

Report SDK engineering, per-action binding code, host/policy setup and migration
tests separately. Do not set an arbitrary line-count goal. A helper that merely
passes an approval boolean or relocates Calcu's entire executor is a no-go.

If dispatch correctness needs a broader authority-store contract, stop public
extraction and scope that contract first. If the seam saves negligible binding
code while adding a second admission system, retain Calcu's current binding.
Either outcome is a useful qualification result. This plan does not complete
ADP-05…09, advertise production execution or change RFC requirements.
