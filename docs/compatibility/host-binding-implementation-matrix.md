# Host-Provisioned Bearer: implementation matrix

Status: implementation plan with reviewed source checkpoint, 2026-09-12.
The [offline proposal representation](../offline-proposal-manifest.md) now
implements a bounded part of the first two rows. The
[offline selected Grant](../offline-selected-grant.md) implements the
representation-only part of the Grant and exposure rows. This matrix is not a
runtime conformance claim or Calcu activation record.

## Reviewed source checkpoint

- Previous SDK pin: `b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691`.
- Current [spec-lock.json](../../spec-lock.json):
  `da550fde6f8be4ff0c1ded15524afb66c2912287`, merged
  [ASP PR #92](https://github.com/0al-spec/agent-surface/pull/92).
- The [compatibility evidence](host-binding-source-update.md) records the
  full five-source review, exact digests and unchanged implemented behavior.
  The reviewed candidate `ea3b2160fd5edab4b7d7d18abd4f098b46088351`
  has identical module bytes to the merge commit.

This completes the source checkpoint, not any planned implementation row below.

The [ASP adoption backlog](https://github.com/0al-spec/agent-surface/blob/main/review/adoption-delivery-backlog.md)
owns ADP status. Row labels below are local planning references, not new tasks,
wire identifiers, packages or public API commitments.

## Required behavior and ownership

Runtime acceptance cases below remain **planned**. The offline follow-up above
records its implemented subset and tests; it does not establish a complete
runtime row or close authenticated discovery and host-owned dependencies.

In particular, current `SurfaceSnapshot` checks a supplied hash but permits it
to be absent. Complete selected-manifest acceptance must require the normative
hash and independently reject a freshly rehashed invalid manifest. Generic
`CanonicalObjectHash` also trusts the caller's selected domain/hashing view;
it is not the planned complete Grant hashing-view validator.

| Area | Existing SDK evidence | Planned reusable SDK behavior | Host-owned dependency and acceptance evidence |
| --- | --- | --- | --- |
| Manifest content and grammar | `JsonDocument`, `SurfaceSnapshot`, partial `ManifestExposureDeclarations` | Validate the complete selected manifest, fixed `auth` discriminator, proposal-only non-persisted Actions, required control metadata and exact audience; reject unsupported features without fallback | App owns operation IDs, business schemas and policy. Two unrelated app fixtures; missing controls, wrong profile, mutable input and freshly rehashed invalid manifests reject. |
| Schema composition | `OfflineSchemaResources` validates its documented offline subset | Retain exact input/output schema resources and compose their checks with manifest acceptance | Host supplies authenticated immutable inputs. Missing/rebound resources, hash mismatch and unsupported dialect/features reject; no implicit network retrieval. |
| Discovery and endpoint trust | Not implemented | HTTPS discovery, exact snapshot pinning, issuer-origin endpoint checks and distinct required control routes | Host supplies trust configuration and actual endpoint addresses before hashing. Wrong CA/SAN, redirect, route aliasing and port changes reject. Offline manifest acceptance is not authenticated discovery. |
| Complete Grant value | `OfflineSelectedGrant` checks a closed single-action Grant, complete hashing view, exact tuple and duplicate identity projection; `credential_profile: "compatibility_bearer"`, method exactly `"bearer"` | Extend only after another selected contract demonstrates need; current value remains representation-only | Issuer supplies independently derived facts. Wrong/missing method rejects even with recomputed hash; no label normalization, abbreviated Grant or credential inside Grant JSON. Shape/hash success does not establish issuance or current authority. |
| Exposure projection | `OfflineSelectedGrant` derives the selected action and control-event projection from the retained manifest and requires exact ordered equality | Reuse the same derivation independently at issuance/mediation; add other source kinds only with a selected consumer | App owns classifications, redaction and trusted handling policy. Omitted, widened, reordered or rewritten sources reject; validation does not prove handling enforcement or consent. |
| Identity and consent | Not implemented | Validate exact profile combinations/projections and bind retained request material to both consent decisions | Host authenticates ordinary user and runtime registration; verifier establishes identity/status. Forged subject, task text used as consent, stale identity and changed approved inputs reject. A TypeScript brand is not authentication. |
| Atomic issuance | Not implemented | Explicit issuance behavior consumes a trusted approved record once and commits complete Grant/verifier state at a qualified authoritative fence | Transactional adapter and external authority contracts must order invalidations against commit. Pause/race each input revision and deadline; failure publishes no usable Grant or credential. Local transaction alone cannot fence an external source. |
| Credential custody and delivery | Not implemented | Generate profile-conforming credential, retain verifier hash only in authoritative state, deliver raw credential only through private mediator channel | Host enforces privileged component placement. Browser/model/log leakage, repeated issuance and uncertain delivery tests; freeze and revoke before replacement, no transparent recovery claim. |
| Self-validation transport | Not implemented | Exact HTTPS POST/body/header/limit/error handling, complete self-view verification and no positive authority cache | Authoritative store supplies current state. Inactive, unavailable, wrong audience, altered/partial response, timeout and oversize cases; validation never substitutes for Action admission. |
| Revocation and user management | Not implemented | Self-only termination, exact retry/unconfirmed state, lineage fence and retained mapping lifecycle | App owns ordinary-user authentication and management UI; adapter supplies durable transition. Expired bearer is termination-only; 204 follows confirmed fencing, not queued cleanup; cross-user selectors and unavailable lookup fail safely. |
| Session, admission and base role obligations | Not implemented | Session generations/current-state admission, applicable budgets, audit, base receipts and control-event mechanics | Host/storage adapters enforce lifecycle and recovery. Revoke/identity races, restart and cancellation tests; rejected admission has zero handler calls. Proposal-only does not waive required role dependencies. |

Pinned source anchors:

- [Core authentication descriptor](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/core.md#host-provisioned-bearer-authentication-descriptor).
- [Binding and exact credential method](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-binding).
- [Private issuance and consent](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-private-issuance-and-consent).
- [Control transport](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-control-transport),
  [self-validation](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-self-validation),
  [revocation/management](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-self-revocation)
  and [qualification cases](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-qualification-requirements).

The control-transport subinventory includes exact POST `{}`, one Bearer header,
strict I-JSON/media type, no browser Origin/CORS/redirect, 1 KiB request body,
64 KiB response body, 8 KiB request headers, and independent client/server
5-second operation deadlines. Test the specified empty HTTP error responses,
401 challenge and diagnostic secrecy as well as semantic responses. None of
these guarantees follows from the offline primitives.

## Source coverage review before implementation

The five currently pinned modules cover relevant source text, not all selected
role dependencies or an implemented binding. Review the **whole changed source
files**, not just the new subsection: Core for discovery/manifest, Authorization
for Grant/identity/consent/session/controls, Privacy for disclosure, Evidence for
hashing/audit/receipts, and Safe Effects for Action semantics.

The current checker requires exactly those five modules. Conformance and its
registries are not in the SDK lock. Before importing their role requirements or
vectors as acceptance evidence, explicitly decide their source coverage and
update checker/tests with the lock; do not silently treat linked live `main`
content as pinned evidence. ASP-over-MCP is not selected by this binding; adding
its source or implementation is not an automatic consequence of this work.

## Delivery sequence and stopping points

1. **Upstream merge and compatibility checkpoint — completed.** Exact source
   pin/digests and coverage are recorded in the compatibility evidence; existing
   hashing/exposure/schema behavior is preserved. No runtime gate is closed.
2. **Offline selected-manifest slice (ADP-05).** The linked offline proposal
   slice implements bounded grammar and retained schema/exposure composition
   with positive and negative fixtures. It stops at representation validation:
   no network, issuance, current authority or Calcu switch. General manifests
   and additional optional features remain unsupported.
3. **Grant values and projection (ADP-05) — bounded offline slice completed.**
   `OfflineSelectedGrant` implements the selected hashing view,
   tuple/method/identity/exposure validation and derivation against a retained
   prepared manifest. Trusted inputs and tests do not qualify the external
   verifier, consent UI, issuer state or runtime mediation.
4. **Issuance, controls and lifecycle (ADP-06/07).** Qualify authenticated host
   integration, transaction/authority fences, HTTPS and management/session paths.
   Deliver negative/integration tests with each sub-slice, not only at the end.
5. **Calcu integration and composed evidence (ADP-08).** Replace reusable local
   mechanics with SDK behavior; retain the math engine and app policy. Test the
   actual HTTPS boundary, recovery, exact retry, cancellation, races and leakage;
   record integration cost. Missing mandatory guarantees still block activation.

Ergonomic wrappers, framework adapters and a second consumer follow demonstrated
reuse. This plan adds no generic registry/config language and makes no agent
retention, Proof-Bound or production certification promise.
