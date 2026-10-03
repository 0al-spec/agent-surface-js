# Offline proposal receipt integrity

Private executable qualification, 2026-10-03 UTC. This extends the
[request/result value qualification](offline-proposal-exchange-qualification.md)
with complete unsigned runtime/app receipts for its selected non-persisted
proposal. Source lock remains `da550fde6f8be4ff0c1ded15524afb66c2912287`.

## Behavior and evidence boundary

After request/result correlation, `PendingProposalEvidence.checkReceiptIntegrity`
takes independently retained host context, the original complete runtime/app
`JsonDocument` values, and an explicit positive safe-integer byte cap. The cap
applies individually to each receipt and the host-context document. Construction
and checks execute no application handler, network lookup or authority operation.

The checked context contains the saved request's `session_id`,
`session_generation`, `grant_id`, `grant_hash`, `surface_hash`, `action_id`,
`idempotency_key`, `trace_id`, runtime `span_id`, `input_hash`, `execution` and
`execution_hash`; plus independently selected `app_id`, `surface_version`,
`runtime: { runtime_id }`,
`actor_agent: { agent_id, identity_evidence_hash }`, `subject: { user }` and
`policies: { runtime: { id, version }, application: { id, version } }`.
`policies` belongs to this local checker context; it is **not a new ASP wire
field**. Hosts obtain these values from their retained authority/selection and
must not copy expectations from received receipts. Audience and remaining Grant
constraints remain host checks against the authoritative Grant.

The checker verifies:

- Strict bounded JSON, exact selected shapes and canonical digest encoding.
- Runtime root with `receipt_type: runtime`, result
  `authorized_for_forwarding`, and no parent/output fields.
- Application child with `receipt_type: app`, result `success`, exact parent
  hash, output commitment and response receipt ID/hash/span.
- Both complete receipt and policy hashes with the existing ASP domains/views;
  full request and host tuple, execution/input commitments, distinct spans and
  conflicting receipt identity within this pair.
- Each producer's own allow decision, enforcer and independently selected
  policy ID/version. Unique rule identifiers and valid selected UTC timestamps.

The return value has `status: integrity_checked`. Its immutable assurance says
receipt integrity is checked and producer authentication, current authority,
trusted time and application acceptance are `not_verified`. It exposes only
`unverifiedOutput()` and fresh complete `receipts()` audit values. Full receipts
are not a browser/UI projection. A fully replaced unsigned chain can recompute
all hashes, and a schema-valid wrong calculation can still have internally
consistent receipts; executable vectors demonstrate both boundaries.

## Selected restrictions

This candidate checks exactly two unsigned action receipts. Signature members
reject as `proposal_receipt_signing_unsupported`, including null/empty/`alg: none`
values; signatures are never removed and silently treated as checked unsigned
evidence. The host must independently enforce any Grant signature requirement.
There are no approval/effect/budget/recovery fields, extensions, trace restarts,
arbitrary receipt graphs, external resources or historical conflict ledger.

The selected allow reason is `policy_allowed`. `approval_satisfied`, denial
reasons, unknown bare codes and unselected extension URIs reject. This is a
bounded SDK selection, not a restriction on the full RFC's extension mechanism.
Rule lists have at most 64 unique nonempty IDs (256 UTF-16 units each),
`safe_to_show` has 1..4096 units, and policy IDs/versions use the 256-unit bound.
The host remains responsible for the safety of explanatory text and domain data.

Timestamps select four-digit years, real UTC calendar dates, `Z`, seconds 00..59
and up to nine fractional digits. A decision cannot be later than its own receipt;
this is a selected constraint, not a trusted clock claim. Exact original timestamp
strings stay in hashing views. Different producers' timestamps need not be
ordered because clocks can differ. No expiry, freshness or trusted-time decision
is inferred from local syntax.

## Normative basis and consumer delta

- [Canonical Object Hash Profile](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/evidence.md#canonical-object-hash-profile): receipt excludes only `receipt_hash` and `receipt_signatures`; policy excludes its own hash. The candidate rejects signatures before applying the unsigned view.
- [Receipt Requirements](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/evidence.md#receipt-requirements), [Receipt Hash Chain](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/evidence.md#receipt-hash-chain), [Receipt Signing Profile](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/evidence.md#receipt-signing-profile): roles, parent linkage, shared commitments and unsigned evidence limits.
- [Policy Decision Object](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/safe-effects.md#policy-decision-object): complete decisions, producer roles, policy snapshots, hash echoes and reason/outcome compatibility.

Calcu's current receipt helper uses bare custom reason codes
`local_forwarding_policy_allowed` and `proposal_action_within_active_grant`.
They do not satisfy this selected reason or the RFC's URI requirement for
extension codes. Before migrating, use an applicable standard code or separately
qualify a declared URI extension and its outcome. This change does not alter
production Calcu; it is an explicit compatibility finding, alongside the existing
`receipt_url`/`input_hash_profile` and receipt-channel prerequisites.

## Validation and next step

The installed-package suite has 675 vectors: 335 existing request/result cases
plus 340 new receipt cases. Synthetic Calcu and Greeting consume the same package
with their own schemas and policy IDs. Tests cover complete/partial evidence,
rehashed substitution, policy/role/hash/tuple/parent/output/span mismatches,
duplicates, byte limits, invalid UTC dates, signature downgrade attempts,
caller mutation, package/type boundaries and zero network/log calls.

Local validation uses Node 26.5.0. The existing CI matrix runs Node 22/24 through
`npm run check`; CI status is separate from these local observations.

Local gates passed: `npm run check` (600 core tests and 675 experimental vectors),
`npm run build`, `npm pack --dry-run`, the package smoke check and
`git diff --check`. The base SDK tarball contains 42 files and does not include
this private experiment.

The [receipt-channel qualification](offline-proposal-receipt-channel-qualification.md)
compares this value checker with Calcu's current loopback HTTPS response and
records why its custom inline receipt members are not yet a declared ASP delivery
choice. Public extraction still requires a host adapter with qualified delivery
and authentication semantics; offline integrity alone does not enable execution
or satisfy full ASP conformance.
