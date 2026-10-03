# Offline inline proposal receipt qualification

2026-10-03 UTC. Private Node-only experiment, not a public SDK API or live
transport certification. Normative source:
[HTTP inline receipt delivery](https://github.com/0al-spec/agent-surface/blob/814084f4d7d06ac85be358ba84533d0718607746/drafts/modules/evidence.md#http-inline-receipt-delivery).

## Evidence boundary

The new path retains a complete original request and requires a complete Runtime
Receipt before retention. It requires a complete App Receipt in the result and
checks the ordinary request/result correlation, hashes, policy decision, receipt
role, selected receipt/context bindings, execution/input/output bindings and receipt parent chain.
Carrier parsing rejects unknown members, missing/full-receipt substitutes, approvals,
signatures, oversized JSON and duplicate members. The whole message, not just the
nested receipt, is bounded.

Packed Calcu and Greeting fixtures use real hashing, schema validation and receipt
integrity code with explicitly synthetic trusted manifest/Grant collaborators.
Separate manifest regressions exercise the real prepared manifest validator.
These checks do **not** establish a real issuer, authenticated peer or HTTP channel.
The host supplies independent receipt expectations, including subject/delegate and
session generation; binding hashes alone do not derive or authorize those facts.
Audience and remaining Grant constraints still require independent host checks.
`PreparedOfflineSelectedGrant.validateFor(manifest)` checks the retained complete
Grant against a genuinely SDK-prepared manifest (app/issuer/version/surface hash).
The inline path requires this behavior before request retention; independently valid
values from different surfaces cannot be mixed. This is representation binding,
not current authorization.

The result exposes only `integrity_checked`. Producer authentication, current
authority, trusted time and application acceptance all remain `not_verified`.
Even a structurally valid, hash-consistent wrong calculation is not proven correct.
No browser export, dispatcher, network call, receipt URL resolution or authority
issuance is added. Old reference-only exchanges remain available; selecting the
new path never silently falls back to them.

## Verification and next gate

`npm run test:proposal-exchange` builds and packs isolated Node consumers, executes
ordinary/receipt/inline vectors, checks TypeScript use and rejects browser imports.
`npm run check` includes this gate; CI uses the existing Node matrix.

Local run: 624 SDK tests and 704 packed exchange tests passed, together with
consumer/type checks, builds, package dry run, exact remote source-lock verification
and `git diff --check`. These counts cover the whole existing suites, not only
the new inline vectors. CI results are reported on the follow-up PR separately.

Next: compose with real prepared host manifest/Grant/context in Calcu, then qualify
the complete loopback HTTPS exchange using trusted CA/SAN validation, no redirects,
finite body/time limits, `Cache-Control: no-store`, producer identity and authoritative
Grant/session lifecycle. Transport failure or response rejection must never imply
zero execution or permission to retry a side-effecting action.
