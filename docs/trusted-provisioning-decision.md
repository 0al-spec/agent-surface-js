# Trusted provisioning: non-OAuth issuance boundary

Status: implementation decision and qualification plan, 2026-09-12. This is
not an implemented issuer, a registered ASP binding, a complete manifest fixture
or a claim that Calcu conforms. It follows the
[manifest contract decision](manifest-contract-decision.md); the upstream
[ADP backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md)
continues to own delivery status. No source-lock or normative text changes here.

## Decision

Keep app-owned issuance and Compatibility Bearer as separate concerns:

- The trusted host establishes the authenticated principal, exact consent,
  verified identity and application policy before invoking an issuer.
- The issuer derives the authoritative Grant and separately provisions a
  credential to the trusted runtime. Neither the browser nor the model gets it.
- The executor independently checks current authority on every invocation.
  A trusted issuance call does not pre-authorize future requests.

Select this as the **candidate host architecture**, not a qualified interoperable
non-OAuth wire binding. The pinned RFC supplies issuance models and mandatory
security semantics, but those are not a complete SDK-selected bootstrap,
authentication, credential-delivery and revocation protocol.

Do not invent `auth.type: "native"` or `"compatibility_bearer"`, accept
`auth: {}` as operational metadata, or switch to OAuth implicitly. Local
dependency injection cannot waive required manifest endpoint declarations.
Complete manifest acceptance remains blocked until a concrete binding is
reviewed; only independently bounded value work can proceed without it.

## Pinned normative evidence

All ASP links below refer to the unchanged source-lock revision
`b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691`.

| Existing contract | What it establishes | What it does not establish |
| --- | --- | --- |
| [Core Endpoints](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/core.md#endpoints) | Enough manifest endpoint information to obtain **or validate** a Grant and invoke actions; required logical `agent_api.credential_audience` | That the action URL is the audience, or that a local issuer function replaces discovery metadata |
| [Grant Issuance Models](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#grant-issuance-models) | App-issued Grants after user consent; alternative issuance models with app-verifiable bindings | A closed non-OAuth `auth` descriptor, local-function signature or HTTP exchange |
| [Grant Credentials and Proof](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#grant-credentials-and-proof) | Explicit development/compatibility bearer custody, short expiry, audience restriction, revocation and application-side verification | Issuance authentication or Proof-Bound assurance from possession of a bearer |
| [Identity profile selection](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#discovery-and-exact-profile-selection) | Exact advertised combination of format, digest, verification, key, freshness and status profiles; fail-closed implementations | Trust established by a profile name, schema-valid envelope or artifact digest alone |
| [OAuth lifecycle](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#oauth-grant-lifecycle-profile) | A concrete conditional OAuth mapping, including issuer-derived subject/projections and OAuth errors | Permission to copy its wire fields, token responses or errors into an unnamed non-OAuth protocol |
| [Semantic revocation](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#semantic-grant-revocation-transition) | Shared inactive-state transition; a non-OAuth Grant Issuer conformance claim requires an authenticated revocation binding | A complete non-OAuth caller-authentication or success-response encoding |

The distinctions matter: non-OAuth issuance is not forbidden, but selecting a
credential profile does not finish defining an issuance model. The missing
SDK-selected binding must not be described as a defect in every ASP deployment.

## Calcu: useful boundary, incomplete qualification

Read-only comparison against Calcu
[`a059d777405579f64a24af96aa1119e1950beee8`](https://github.com/SoundBlaster/Calcu/tree/a059d777405579f64a24af96aa1119e1950beee8),
not an assertion about future Calcu revisions:

- [`server/demo.ts`](https://github.com/SoundBlaster/Calcu/blob/a059d777405579f64a24af96aa1119e1950beee8/server/demo.ts)
  invokes issuance from the host, supplies a fixed `calcu-demo-user`, creates a
  short-lived task Grant and revokes it in `finally`. This is development
  provisioning, not authenticated account selection and exact Grant consent.
- [`server/taskHost.ts`](https://github.com/SoundBlaster/Calcu/blob/a059d777405579f64a24af96aa1119e1950beee8/server/taskHost.ts)
  checks Host, Origin and a process-session cookie. Those controls protect the
  local task API; they do not by themselves establish the asserted ASP user or
  approval of the exact immutable Grant request.
- [`server/executor.ts`](https://github.com/SoundBlaster/Calcu/blob/a059d777405579f64a24af96aa1119e1950beee8/server/executor.ts)
  validates a closed local `GrantRequest`, verifies identity and binds a bearer
  to private state. That request carries a user string and raw artifact bytes;
  it is not the OAuth semantic request, nor a portable ASP issuance message.
  Its abbreviated manifest, hash-only credential evidence and shortened session
  records retain the gaps catalogued in the [boundary contract](boundary-contract.md).

Preserve the useful separation of host, mediator and executor. Do not export
these local DTOs unchanged or treat their TypeScript names as wire semantics.
No Calcu code, live task, credential or agent-internal retention behavior was
changed or exercised for this decision.

## Candidate local control-path contract

These are requirements for **future SDK/host qualification**, not additional ASP
wire fields or accepted public API signatures. Constructors remain inert; the
explicit issuance operation performs checks and commits state only on success.

1. **Trusted inputs.** A host-owned authentication mechanism supplies the user;
   a reviewed runtime association supplies the runtime; independent identity
   verification supplies the agent binding. A public DTO or TypeScript brand is
   not evidence that these checks occurred. Untrusted task text cannot select
   subject, credential, authority store or an expanded action set.
2. **Retained proposal and consent.** Retain the exact authenticated manifest,
   requested actions/locations/scopes, applicable constraints and selected
   identity/exposure profiles. The host binds consent to the material request
   and issuer-derived projections. Any relevant drift requires new consent;
   there is no boolean `approved` shortcut. This is Grant consent, not an
   Action Approval Receipt and not proof of natural-language intent.
3. **Independent derivation.** The issuer validates the retained inputs against
   current policy and evidence; derives the subject and complete identity/data
   exposure projections; constructs the complete Grant and its specified hash.
   Client-supplied derived projections are not authoritative. Application IDs
   and operation schemas remain generic, not calculator constants.
4. **Commit and custody.** Establish authoritative Grant state before returning
   a usable credential. Provision the credential and exact binding only over
   the selected trusted runtime channel, outside Grant JSON, UI, model context,
   diagnostics and logs. Failure must not publish a usable partial result.
   Persistence, retry/recovery and unavailable-store behavior require explicit
   qualification; an in-memory map proves none of them.
5. **Independent admission and lifecycle.** Resolve the credential to current
   authority, verify the exact subject/delegate/audience/snapshot and applicable
   identity status at invocation. Grant revocation must fence subsequent
   admission according to the normative transition. Session start/control,
   budgets, audit and required control events remain separate obligations;
   revoking a task Grant is not a substitute for session lifecycle semantics.

## Binding decisions still required

Before a complete operational fixture or exported issuer can pass review, define
one coherent deployment contract for all of the following:

- Authenticated bootstrap and exact manifest `auth`/endpoint metadata, including
  how an already provisioned runtime validates its Grant. Distinguish discovery,
  issuer, logical audience, invocation, introspection and session-control roles.
- Principal/runtime authentication, consent completion, freshness and replay
  handling; no inference of consent from submitting calculator task text.
- Exact issuance request/result and error shapes, identity advertisement,
  credential delivery, limits and retry/recovery semantics. Keep local private
  implementation records distinct from serialized messages.
- Authenticated revocation, current-state lookup, acknowledgement semantics and
  unavailable-state behavior, preserving the shared revocation transition.
  The pinned [Active Grant Management](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#active-grant-management)
  contract also requires a generic HTTPS `revocation.grant_management_url`
  on the issuer origin for a Surface Publisher used by a Grant Issuer. The
  management view authenticates the ordinary app user, not a bearer or supplied
  subject selector; the manifest URL contains no user/Grant-specific values.
  The Runtime also needs its local grant view and the trusted management URL.
  A host-only `revoke()` function does not provide those user paths.
- The selected role's required audit, control-event and session obligations,
  plus their transport and exposure declarations. A small proposal-only action
  does not automatically make these optional. In particular, Core's
  `audit.required_fields` advertises the nonconditional receipt minimum and
  cannot weaken Receipt Requirements. This decision implements no receipts and
  does not resolve the full role claim merely by leaving optional signing out.

If this needs new interoperable wire metadata or an exemption to a pinned
requirement, take a bounded clarification proposal to the RFC first. This SDK
decision neither changes that RFC nor grants such an exemption. Do not silently
advance the source lock to make a prospective fixture pass.

## Acceptance evidence to implement after the binding decision

The following cases are **planned**, not executable tests or a conformance report:

| Scenario | Required evidence |
| --- | --- |
| Authenticated principal, current evidence, exact consent and selected binding | Issuer-derived complete Grant, separate protected credential delivery, independently checked application invocation |
| Forged user/runtime, task-supplied authority, absent/stale/mismatched consent | No new usable credential or authoritative Grant; no handler call |
| Unadvertised/mixed identity profiles or inactive/unavailable verification | Fail closed before issuance; no fallback to digest or schema validation |
| Surface/action/constraint/exposure changes after consent | Reject stale binding without repairing the old snapshot or extending its authority |
| Empty auth metadata, unsupported binding, missing selected controls | Configuration/manifest rejection where knowable, not late implicit fallback |
| Wrong audience or swapped Grant/identity/hash at invocation | Independent executor rejection with zero handler calls for that request |
| Wrong user, caller-supplied subject or Grant Credential used as user authentication on management path | No cross-user enumeration/revocation; derive the owner from ordinary authenticated app state |
| Revocation or identity invalidation during asynchronous admission | No admission past the relevant authoritative fence; no claim to undo already committed effects |
| Delivery failure, duplicate issuance attempt or unavailable state | Tested binding-specific retry/recovery; no untracked credential or accidental authority duplication |
| Schema/Grant/session validation succeeds offline | Report representation evidence only; do not declare consent, active authority or live interoperability |

Next decision checkpoint: review the smallest non-OAuth binding proposal that
closes the concrete metadata, authentication, delivery and revocation gaps above.
Only after that checkpoint define public SDK signatures and executable fixtures.
