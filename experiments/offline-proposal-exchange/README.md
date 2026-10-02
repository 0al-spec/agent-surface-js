# Offline proposal exchange experiment

Private Node.js experiment, 2026-10-02 UTC. Implements the representation and
correlation stage of the [selected wire contract](../../docs/plans/proposal-exchange-wire-contract.md).
The complete result acceptance path still needs receipt, transport, authority
and application checks. The base SDK exports and pinned ASP source lock are unchanged.

## Behavior

`OfflineProposalExchange` takes the host's original `JsonDocument` request,
trusted prepared input/output schemas, and explicit request/result byte limits.
Construction captures those values. `prepare()` performs strict JSON parsing,
closed control-field validation, input schema checking and recomputation of
ASP input/execution hashes. It retains its own request text before dispatch.

The returned value offers:

- `request()`: a fresh document containing the validated request value. Source
  formatting can change; the resulting serialized request must fit its byte cap.
- `correlate(result)`: validates the original bounded result JSON, compares it
  with the saved request, requires a distinct application span, validates output
  under the selected schema, then computes its ASP output hash.

Correlation returns `PendingProposalEvidence`, whose only state is
`evidence_required`. `unverifiedOutput()` returns a fresh output document;
`evidenceInputs()` returns the original request/result values and computed
`output_hash` for the host's subsequent checks. None of these values establishes
an authenticated producer, receipt integrity, current authority, application
correctness or interpretation of the user's task. A schema-valid incorrect
calculation deliberately remains correlated, unverified data.

The exact selected fields and hash domains come from the design contract. The
experiment rejects unknown controls, unsupported modes/results, invalid IDs,
invalid canonical digest encoding, stale correlation and borrowed runtime spans.
It makes no network requests, executes no handlers and performs no retries.
SDK diagnostics contain fixed codes, without embedding rejected payloads or
schema-collaborator exception text. Domain data classification stays application-owned.

## Host obligations

Supply the original request before sending it; constructing expectations from
the response would defeat correlation. Select schemas independently from a
trusted declaration. Prefer the bounded `OfflineSchemaResources` implementation;
the `PreparedSchema` collaborators are trusted, synchronous in-process code.
The experiment contains callback re-entry and caller mutation of returned JSON
values, but does not sandbox hostile JavaScript dependencies or provide CPU
deadlines for arbitrary custom validators.

Before verified success, the host must still establish:

1. The selected action/declaration, non-persisted proposal behavior, disclosure
   policy and current session/Grant/identity/authority.
2. Authenticated action and receipt transport, exact complete parent/app receipts,
   bounded receipt JSON, producer authentication and integrity of each receipt
   and its policy decision.
3. Receipt role, full authority tuple, parent/input/execution/output/result
   bindings and application-specific output/disclosure checks.

Well-formed receipt references are retained for these checks. A changed valid
receipt ID/hash also returns `evidence_required`; this stage cannot determine
whether the referenced receipt exists or belongs to the operation. There is no
`verified` flag, boolean trust callback or method that promotes it to accepted
execution. Response rejection after dispatch does not prove zero execution or
justify resending/refunding quota.

The existing manifest grammar gaps for `receipt_url` and `input_hash_profile`,
and the reviewed receipt-channel binding, remain prerequisites for live use.
This experiment accepts no inline receipt extension or response-supplied URL.

## Run and package boundaries

```sh
npm run test:proposal-exchange
```

The command builds the SDK and private experiment, packs both into a unique
temporary directory, installs them into an isolated consumer, runs the vectors,
checks consumer TypeScript and exercises synthetic Calcu/Greeting values.
Consumer tests import package exports, never repository source files. Temporary
artifacts are removed in `finally`; npm lifecycle scripts are disabled in the
consumer install. Ordinary `npm run check` includes this command, so the existing
Node 22/24 CI matrix also runs it.

The private package `@0al/offline-proposal-exchange-experiment` exposes only its
root entry under the `node` condition. A real Vite browser build must reject that
entry; this protects import ergonomics, not isolation of malicious code. The
experiment is excluded from the base SDK tarball and is not published.

See [the qualification report](../../docs/reports/offline-proposal-exchange-qualification.md)
for observations and the remaining receipt stage.
