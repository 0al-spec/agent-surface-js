# Proposal: Host-Provisioned Bearer Binding

Status: **unaccepted proposal for RFC review**, 2026-09-12. Nothing here is an
implemented SDK API, registered profile, accepted manifest, or conformance
claim. The baseline remains ASP `b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691`.
This document supplies concrete choices for the
[trusted provisioning decision](../trusted-provisioning-decision.md), not a
second backlog. Merging this proposal does not close that decision's gates.

## 1. Selected deployment and exclusions

Choose one privileged application host containing both the issuer and its
registered Runtime mediator. Untrusted agents run outside that host. The host
performs issuance through a private control path; there is **no public issuance
HTTP endpoint**, browser token exchange or agent-callable issuance tool.

Runtime-to-application calls still cross the authenticated HTTPS boundary.
The application independently enforces the Grant. Same-host composition is not
independent-vendor trust or isolation from malicious privileged host code.
Remote runtimes, pairing codes and cross-process credential delivery need a
different, separately specified bootstrap binding.

Select only the existing Compatibility Bearer credential profile. A stolen
bearer can impersonate its holder within that Grant; this proposal does not
prove the network caller is the registered Runtime. It is development/
compatibility-only, never Proof-Bound. Do not market same-host placement or TLS
server authentication as sender constraint. A thief holding a bearer can obtain
that Grant's self-view or terminate its authority: the resulting disclosure and
denial-of-service risks are explicit limitations of this candidate.

Initial scope: a proposal-only surface with a non-persisted action, no resource
reads, subdelegation, refresh, exchange, renewal, purpose binding or optional
attestation profiles. Grant, identity, consent, session, audit, exposure and
required control obligations still apply. Excluding optional receipt signing
does not exclude base application receipts. An implementation missing a required
role dependency cannot activate this full binding.

## 2. Proposed discovery metadata

The following **new discriminator is proposed**, not defined by the pinned RFC:

```text
https://github.com/0al-spec/agent-surface/profiles/host-provisioned-bearer/v1
```

It is an identifier candidate, not a claim that a document exists at that URL.
Propose a closed `auth` object with exactly these two members:

```json
{
  "type": "https://github.com/0al-spec/agent-surface/profiles/host-provisioned-bearer/v1",
  "credential_profile": "compatibility_bearer"
}
```

This is a manifest **fragment**, not a complete valid manifest. It deliberately
does not use the unqualified type names `native` or `compatibility_bearer`.
Existing implementations must reject an unsupported discriminator, not infer
OAuth or omit auth checks. This change needs explicit RFC acceptance before an
SDK validator can accept it under a reviewed new source lock.

Use existing endpoint roles rather than adding a parallel registry:

| Existing manifest member | Selected meaning in this proposal |
| --- | --- |
| `agent_api.credential_audience` | Exact logical HTTPS protected-resource audience; not inferred from a socket or action URL |
| `agent_api.grant_introspection_url` | Self-only HTTPS validation defined in section 5 |
| `agent_api.grant_revocation_url` | Self-only HTTPS revocation defined in section 6 |
| `agent_api.action_url` | Existing Action Request binding and independent admission |
| `agent_api.session_control_url` | Required existing session safety endpoint for the Runtime role |
| `revocation.grant_revocation_url` | Equal to the selected runtime revocation URL |
| `revocation.grant_management_url` | Separate ordinary-user management, as required by the existing RFC |

Do not advertise `grant_request_url`, OAuth authorization/token/introspection
URLs, refresh grants or an authorization-details type for this binding.
The runtime **validates** its privately provisioned Grant through declared
metadata; it does not discover a way to obtain a credential from an anonymous
web request. This is the proposed use of Core's “obtain or validate” alternative,
not permission to omit the complete manifest or its authenticated discovery.

All selected control URLs are absolute HTTPS URLs on the issuer origin with no
userinfo, query or fragment. Distinct endpoint roles have distinct paths; the
two revocation metadata members intentionally name the same endpoint. The
logical audience remains a separate exact value. Discover and pin the complete manifest through ordinary
ASP HTTPS discovery, including the required identity advertisement and selected
audit/control declarations. Resolve the actual port/URLs **before** publishing
and hashing; never insert a random port into an already pinned snapshot.
Loopback deployments explicitly trust their server CA and verify the IP SAN;
disabling certificate verification is not allowed.

## 3. Private issuance and exact consent

There is no new serialized issuance DTO. The private issuer accepts only a
host-owned reference to an approved request record, looked up in authoritative
host state. Model/browser strings, copied record identifiers and a boolean
`approved` cannot create that reference or establish approval.

The record retains these logical inputs (not new Grant wire members):

- The user derived from a currently authenticated ordinary app session, plus
  the host registration for the Runtime. Never accept a submitted subject or
  runtime ID as authentication. App login remains the app's existing mechanism;
  a generic process cookie alone is not evidence of an account binding.
- The independently verified agent identity and exact advertised profile
  combination, current policy and immutable manifest/retained schemas.
- Requested locations/actions/scopes and applicable constraints; independently
  derived identity/exposure projections and the corresponding consent views.
- The two required decisions: canonical local consent-preview confirmation
  and issuer consent for the exact retained material semantics. Co-location
  does not waive either derivation or confirmation. Consent is not task prose,
  natural-language intent verification or an Action Approval Receipt.

Immediately before issuance, recheck authentication, current identity status,
policy, snapshot and consent binding. This recheck is not a separate check-then-
commit step: the successful issuance linearization point atomically validates
the authoritative input revisions and their validity deadlines, consumes the
approved record, and commits the Grant and credential verifier state. All
relevant authentication/runtime-registration, identity, policy, snapshot/schema
and consent changes participate in that same serialization or fencing contract.
Use a serializable transaction or equivalent version/fence validation at commit;
values checked only before asynchronous work are insufficient.

An external identity/status or policy source requires a qualified contract that
orders its relevant invalidations against issuance and keeps its accepted
evidence valid through the commit point. A cached `active` value, recorded
revision, future expiry or local database transaction alone cannot fence an
independent source. If that source cannot participate in the required ordering,
or current validity cannot be established at commit, fail closed without issuing
a usable Grant or delivering a credential.

Any material change before that point invalidates the approved record and
requires a new preview/consent flow; do not repair it or retry against changed
inputs under old consent. Discard any privately prepared credential on failure.
Changes after successful commit follow the ordinary current-state admission
and revocation rules; this fence is not a promise of future identity validity.

Derive the complete existing Grant Object from exactly those fenced inputs,
including both full identity projections, effective data exposure, expiry and
its prescribed hash.
Retain that exact complete hashing view for the Grant lifetime and required
audit-retention period; do not reconstruct a convenience subset on lookup.
Unknown or unsupported authority-bearing fields fail closed, not by stripping
them before hashing. Principal/consent storage is a trusted dependency with
tested lifecycle semantics, not a schema-validation result.

For this proposed development binding, generate one 256-bit random credential
(43 unpadded base64url characters) per Grant, with expiry no later than 60 seconds
after issuance or any earlier applicable evidence/policy limit. Store only its
verifier hash in authoritative credential state; store the complete Grant and
exact audience separately. The raw credential is not a Grant member.

Commit state before handing the credential and complete Grant to the registered
mediator through a private, non-serializable host channel. Only that mediator
retains raw credential custody. It independently checks the Grant, projections,
audience and snapshot before session start. Neither an agent adapter nor the
browser receives this provisioning result or direct issuer access.

Issuance is **at most one attempt per approved record**, not retryable credential
delivery: consume the record atomically with issuance. A repeated invocation
cannot mint another Grant. If delivery fails or its outcome is uncertain, freeze
use and revoke any resulting Grant before allowing a new consent/issuance
attempt. Do not reconstruct a credential from a verifier hash or blindly issue
a replacement. This first proposal has no transparent restart recovery: state
must be retained until revocation is confirmed, or host restart must invalidate
all pre-restart credentials at every enforcement point. If either condition
cannot be established, startup/issuance stays blocked.

## 4. Common control transport rules

Sections 5 and 6 define **new candidate non-OAuth messages**, not RFC 7662/7009
requests. They do not change existing Action Request or Session Control schemas.

- Exact `POST` to the declared URL; request body is exactly the JSON object
  `{}` (insignificant JSON whitespace allowed). No grant/user/runtime selector,
  credential field, duplicate member, query selector or extra property.
- Exactly one `Authorization: Bearer <credential>` header. Only the candidate's
  43-character base64url credential syntax is accepted. No cookie auth, credential
  in URL/body, form encoding, redirects or cross-origin credential forwarding.
- Verify TLS, Host/authority and exact path. Reject browser `Origin` requests;
  expose no CORS permissions. These are trusted-runtime control endpoints.
- Request body limit 1 KiB, response body limit 64 KiB, aggregate request header
  limit 8 KiB and a 5-second request/response deadline enforced independently.
  Oversized headers return 431. Strict I-JSON,
  `Content-Type: application/json` for JSON, `Cache-Control: no-store` and
  `X-Content-Type-Options: nosniff`. No bearer/evidence/Grant logging.
- Invalid method returns 405; wrong route 404; malformed framing/JSON/extra
  members 400; wrong media type 415; oversize request 413; missing/malformed
  Authorization 401. Errors have an empty body; a 401 includes
  `WWW-Authenticate: Bearer`. These are binding HTTP statuses, not new ASP error
  codes or substitutes for action errors.
- Temporary backend/transport failure is not successful validation or
  revocation. The client rejects malformed, oversized, truncated or unexpected
  responses without echoing their content. Introspection results cannot be
  reused as an authority cache. Local cancellation does not undo server work.

## 5. Self-only Grant validation

The bearer selects its own authoritative record; there is no second target
token or caller-supplied tuple. Verify audience, expiry, current Grant and
required identity/policy state before disclosing anything. Possession of this
development bearer authorizes only the owning runtime's complete self-view,
not a grant directory or another user's management view.

For an unknown, inactive, expired, revoked, wrong-audience, undisclosable or
otherwise unprovable binding, return HTTP 200 with exactly:

```json
{"active":false}
```

For verified active state, return HTTP 200 with exactly the keys `active`,
`credential_audience` and `grant`. `active` is `true`, `credential_audience`
equals the pinned manifest's logical audience, and `grant` is the **complete**
existing ASP Grant Object, not an abbreviated local record. No raw credential
or identity artifact is included. If full disclosure is not authorized or the
bounded response cannot represent it, do not redact a hashed Grant and report
it as complete: return inactive. Infrastructure unavailability may instead
return 503; neither response permits use of an earlier positive result.
Temporary evidence unavailability returning inactive fences use but does not
mark the Grant terminal or prove revocation/cascade completed. Recovery requires
fresh checks of the same exact binding. An unavailable authoritative store
returns 503, never an inferred unknown record.

The mediator verifies the full Grant hash and exact expected user/runtime/
agent/app/issuer/surface version/hash and audience, then validates all selected
constraints/projections. An active response from the wrong issuer or for the
wrong retained tuple is not usable. The executor still checks current authority
at each action's admission boundary; a prior active response is no guarantee.

## 6. Self-only revocation and user management

A well-formed bearer authorizes only revocation of its own located Grant, never
a caller-selected Grant. The candidate explicitly permits a retained **expired**
bearer for this safety-only operation; it does not reactivate it or permit
introspection disclosure/actions. Verify stored credential/audience binding;
recognized wrong-audience credentials return 401 without affecting either
audience. Unknown credentials receive empty 204 only after a successful
authoritative lookup. An inactive **credential** is not grounds to skip the
transition of a located Grant or its lineage.

Retain historical verifier-hash-to-Grant/audience mappings until all authority
they identify is confirmed inactive, then for at least 24 hours after both
credential expiry and that confirmation (a candidate retry window, not an ASP
default). Keep required Grant/audit retention independently. Never reassign or
deliberately reuse credential bytes/mappings. After safe mapping removal,
unknown may return 204; cleanup cannot leave authority requiring invalidation.

For a located Grant, invoke the existing Semantic Grant Revocation Transition,
including all credentials, applicable lineage and its concurrency fence, before
returning empty HTTP 204. Success must not merely mean that a job was queued.
For an already-inactive Grant, confirm the required lineage/fence is established
before the same idempotent 204; credential expiry alone does not establish it.
Repeated revocation preserves the original effective instant and causes no
duplicate cleanup/control events. If the transition cannot be confirmed, return
503 with `Retry-After: 1`, never 204. Do not borrow OAuth's 200-success semantics
without declaring a different protocol.

The runtime freezes new actions as soon as revocation is requested. On timeout,
abort, 503 or any non-204 response, confirmation is unknown: retain the sensitive
credential for this retry path, never for more actions. Retry the same credential
after the delay, without minting authority; bounded local retries may stop but
must leave an explicit unconfirmed state. Receiving 204 never proves rollback
of effects already committed before the fence.

Ordinary-user management remains mandatory and separate: generic issuer-origin
HTTPS `revocation.grant_management_url`, authenticated app owner derived from
the ordinary user session, ownership-filtered inspect/revoke, required user
confirmation and read-your-writes state. The Runtime also provides its local
view and the trusted management link. Bearer possession is not user
authentication; management requires no functioning agent or Runtime.

## 7. Review vectors and implementation order

These are **specified candidate cases, not passing conformance vectors**:

| Case | Expected result |
| --- | --- |
| Exact private consent record, active identity, selected complete manifest | One issued Grant and mediator-only credential; no action without normal session/admission |
| Forged record reference, subject selector, stale consent or identity | No credential or Grant publication; zero handler calls |
| Pause after initial recheck; change authentication/runtime registration, identity, policy, snapshot/schema or consent before commit | Commit fence rejects each interleaving; no committed usable Grant or delivered credential; no retry under stale consent |
| External status check completes but its revision is invalidated or freshness expires before commit; source cannot provide ordering | Fail closed at commit; a local transaction or cached positive result does not permit issuance |
| Concurrent use of one consent record | At most one issuance; no delivery-retry minting |
| Delivery failure, crash or unavailable authority store | Frozen use; confirmed revocation or fail-closed restart before replacement |
| Introspection with expired/revoked/unknown/wrong-audience credential | Exactly inactive, no distinguishing identity or ownership details |
| Active response with altered/partial Grant, mismatched audience/tuple or oversized body | Client rejection, no use of cached positive state |
| Token/selector in JSON or URL; browser Origin; duplicate Authorization; redirect | Reject before control operation; no credential forwarding |
| Self-revoke active or expired located credential | 204 only after required invalidation/fence; no additional action authority |
| Repeated/unknown/inactive self-revoke | Empty 204, no enumeration or duplicate side effects |
| Expired/inactive token still identifies live semantic authority; mapping store unavailable | Invalidate the complete located authority before 204; unavailable lookup is 503, never unknown |
| Revocation 503/timeout/abort; concurrent admitted action | Freeze subsequent use; unknown confirmation, exact retry; respect committed-effects boundary |
| Management with bearer-as-user-auth or another user's selector | No cross-user read/revoke |
| Missing management/session/audit/identity dependencies | No full-binding activation despite a valid auth fragment |

First review the proposed discriminator, self-bearer control authority and
non-retryable private issuance as one coherent RFC change. Then amend the
appropriate Core/Authorization sections, add transport vectors and review the
SDK source-lock update. Only afterward implement the selected manifest/Grant
values and issuer/control adapters; integrated Calcu evidence follows. Existing
offline schema tests validate none of the proposed control-path behavior.

## 8. Exact upstream change surface

Against the pinned baseline, the proposed normative patch would:

1. Extend [Core Endpoints](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/core.md#endpoints)
   with the closed candidate auth descriptor and validation-only discovery route.
2. Add the private host provisioning and non-OAuth control messages after
   [Grant Issuance Models](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#grant-issuance-models),
   outside the conditional OAuth lifecycle profile. Do not reuse OAuth errors
   or wire shapes by implication.
3. Reference, not duplicate or weaken,
   [credential custody](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#grant-credentials-and-proof),
   [identity selection](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#discovery-and-exact-profile-selection),
   [session authority](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#session-authority-and-lifecycle),
   [user management](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#active-grant-management)
   and the [revocation transition/fence](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/drafts/modules/authorization.md#revocation-timing-and-concurrency).

This PR changes none of those normative sections and reserves no identifier.
