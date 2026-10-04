# Consent-bound issuance — Stage 1 gate matrix

Status: **incomplete; no host is qualified to begin issuer implementation**.
Reviewed 2026-10-04 UTC. This is an evidence and owner-decision matrix for the
[consent-bound issuance plan](../plans/consent-approved-request-issuance-slice.md).
It does not authorize an issuer, migration, source-lock update, or ADP status
change.

## Decision summary

The SDK can validate selected offline manifest, schema, request, Grant,
attenuation and receipt representations. That is reusable SDK behavior, but it
does not authenticate any participant, record consent, establish current
authority, or fence issuance against concurrent host writers.

No reviewed host currently passes the complete Stage 1 design gate:

- **Calcu** is not a qualified principal source for this slice: the inspected
  demo uses process-local session state and a fixed demo subject, not an
  ordinary account/session lifecycle.
- **Memos** is the selected design candidate for account/session behavior, but
  the source-backed proposal still lacks owner approval and complete writer,
  route, consent, external-authority and credential-delivery contracts. Its
  SQLite experiments cover selected storage behavior, not a complete issuer.
- **SpecSpace** was considered as a single-operator host, but the inspected
  optional Basic-auth profile does not establish revocable account sessions or
  a shared issuance fence.

These are findings from the pinned inspections listed in the linked design
records, not claims about every deployment or current uninspected source tree.
The owner roles below are responsibilities; named owner approval has not been
recorded. Do not fill that gap by assigning ownership to the SDK.

## Gate matrix

| Boundary and accountable owner role | Current evidence | State | Pass evidence required |
| --- | --- | --- | --- |
| Ordinary User and exact session — selected host authentication/integration owner | Memos has account and refresh-session records, but access-token resolution does not itself bind the exact live refresh session. Sign-out and rotation have persistence/error semantics that need route adoption. Calcu's demo cookie is not an ordinary account session. | **Open** | A named host owner accepts the exact User/session source. The trusted issuance path resolves that exact session, and logout, rotation, expiry, account changes and storage failures have source-backed outcomes. A generic cookie, JWT/PAT alone, or caller-supplied ID fails. |
| Registered Runtime — deployment/runtime owner | No reviewed record establishes a registration source, exact runtime binding, or revocation ordering for the selected host. | **Open** | The owner identifies the authoritative registration and lifecycle. Tests/evidence show missing, substituted, expired and revoked registrations reject before issuance, including invalidation racing with the commit point. |
| Agent identity — trust/identity owner | SDK validates the selected identity-evidence representation. No selected host verifier, trust root, live status source, freshness rule, or external invalidation fence has been qualified. | **Open** | The owner selects supported evidence profiles and provenance, current-status/freshness semantics, and how status changes are ordered against issuance. Unavailable or unordered status fails closed; the guarantee is demonstrated for the selected topology. |
| Manifest, schemas and policy — application/policy owner | SDK retains and checks selected content and hashes. Host-side authoritative selection, policy revision ownership, retention and invalidation of pending approvals are not qualified. | **Partial** | The owner identifies immutable byte sources and authoritative revisions. A change to any selected manifest/schema/policy invalidates pending approvals; request and Grant are rechecked against those exact retained bytes at finalization. |
| Local preview confirmation — consent UX/application owner | The plan requires a canonical safe preview tied to retained material. No actor-authenticated preview record or withdrawal lifecycle has been selected. | **Open** | The owner specifies the authenticated actor, exact preview projection, binding to the request/manifest/schema/policy revisions, deadline, withdrawal and audit semantics. Changed material requires a new preview and confirmation. |
| Issuer consent — issuer-policy owner | The symbolic model distinguishes this from local preview confirmation, but does not authenticate either actor or decision. No concrete issuer decision lifecycle is qualified. | **Open** | A separate authenticated decision is recorded for the exact same retained material; neither task prose, login, one `approved` boolean nor an Action Approval Receipt substitutes. Missing, copied, wrong-actor, stale or withdrawn decisions reject. |
| Shared commit/invalidation fence — selected host storage and all-writer owners | Memos design selects one SQLite topology and documents selected writers. Overlay experiments cover subsets; existing auth-route adoption, all refresh writers, external identity/policy ordering, transaction failure and complete route-level races remain open. | **Partial; blocking** | Host-owned writers join one demonstrated ordering boundary. Each external authority either participates in that ordering or has a separately qualified valid-through-commit guarantee. At the linearization point, the approved record is consumed once and the complete Grant plus verifier state commits atomically. Before/after races, independent handles, failures and restart uncertainty are exercised. An SDK-local mutex or independent `get`/`set` calls fail. |
| Credential generation, storage and private delivery — key-custody/mediator owners | No real credential issuance or private mediator channel is implemented. The symbolic model's delivery counters are not evidence of secret custody or recovery. | **Open** | A selected CSPRNG/encoding/expiry contract is implemented; persistent state contains only the verifier plus the complete Grant and exact audience; raw credential is delivered only to the registered mediator after commit. Leakage, failed/ambiguous delivery, restart and no-remint behavior are tested. |
| Current Action admission/revocation — application enforcement owner | Offline Grant and receipt checks do not show that all execution paths consult current authority or reject credentials invalidated after issuance. | **Open for activation** | The actual selected enforcement points validate current Grant/session state and reject revoked or stale credentials. This remains a later integration gate even if the Stage 1 design is accepted. |

## Stage 1 exit rule

Stage 1 is **not complete** while any required design row above is `Open`, or
while the shared fence remains `Partial`. `Open for activation` is a separate
downstream enforcement gate and is not mislabeled as a Stage 1 design result.
Completion requires source-backed owner decisions for the selected topology,
exact material/decision bindings, all host-writer ordering and post-commit
uncertainty. Every external authority must either share the commit ordering or
provide a separately qualified guarantee that its evidence remains valid
through commit. If neither can be shown, that profile is a no-go; a cached
`active` result or a future expiry alone is not a substitute.

Stage 1 completion would permit designing the smallest SDK behavior against
those selected contracts. It would not itself permit live activation,
credential delivery, full ASP conformance, or a production claim. Until then,
keep the SDK at offline validation and do not add public issuer/session APIs.

## Evidence references

- [Consent-bound issuance plan](../plans/consent-approved-request-issuance-slice.md)
- [Non-live symbolic qualification](../host-contract-qualification.md)
- [Host authentication/adapter selection](../plans/host-auth-adapter-selection.md)
- [Memos session/account fence design and writer map](../plans/memos-session-issuance-fence.md)
- [SDK/host responsibility boundary](../plans/consent-approved-request-issuance-slice.md)
- [Host-provisioned binding implementation matrix](../compatibility/host-binding-implementation-matrix.md)
