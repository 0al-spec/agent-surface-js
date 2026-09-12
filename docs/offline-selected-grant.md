# Offline selected Grant

Status: implementation follow-up under the exact ASP source lock
`da550fde6f8be4ff0c1ded15524afb66c2912287`.

This slice validates the immutable value of one authoritative Agent Grant for a
previously prepared [offline proposal manifest](offline-proposal-manifest.md).
It also recomputes the Grant's effective `data_exposure` from the selected
manifest sources. It does not issue authority or make an inactive Grant usable.

## Boundary

The trusted host supplies original Grant JSON and the already prepared manifest
value. Validation retains the complete supported Grant hashing view, verifies
the supplied `grant_hash` with the ASP Grant domain, and refuses unknown or
unsupported authority-bearing members. It never strips a field before hashing,
normalizes a protocol label, adds a constraint, repairs an array, or substitutes
a similarly named manifest declaration.

For the Host-Provisioned Bearer subset, the Grant must bind one subject, Runtime,
agent, complete identity-evidence projection, application, surface, action URL,
proposal Action, scope, expiration representation, credential-release denial,
effective exposure and base receipt requirements. `credential_profile` is
`compatibility_bearer`; `credential_binding.method` is separately and exactly
`bearer`. Both identity-evidence copies are complete and structurally equal.
The raw bearer credential, verifier hash, Passport bytes and model/browser data
are not Grant members.

The projection follows the pinned Data Exposure Contract source closure and
ordering. For the current manifest subset it contains the selected proposal
Action and the advertised `grant.revoked` control event. Each entry copies the
complete source `classes`, `redaction`, and `retention` declaration. Empty class
sets remain explicit. A missing, extra, stale, reordered or rewritten entry is
an integrity failure even when the received Grant was freshly rehashed.

## What successful preparation does not prove

- The publisher, issuer, ordinary user, Runtime or agent was authenticated.
- Identity evidence is valid, fresh or active.
- Consent exists or is bound to this value.
- `expires_at` is current; this slice checks wire representation, not a trusted
  clock or the 60-second issuance deadline.
- The Grant exists in authoritative storage, is active, unrevoked or within
  budget.
- A bearer credential was generated, delivered, protected or presented.
- A session was started or an Action Request was admitted.
- Declared disclosure, retention, receipt or transport behavior is enforced.

Those checks require issuer, verifier, state, clock, credential-custody,
transport and Action Executor dependencies. They remain later rows in the
[implementation matrix](compatibility/host-binding-implementation-matrix.md).

## Normative basis

- [Grant Object](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#grant-object)
- [Grant Hash](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#grant-hash)
- [Host-Provisioned Bearer Binding](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-binding)
- [Data Exposure Contract](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/privacy.md#data-exposure-contract)
- [Canonical Object Hash Profile](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/evidence.md#canonical-object-hash-profile)

General OAuth requests, Proof-Bound credentials, runtime identity, attestation,
purpose binding, remote-processing, training-use, approval-receipt signing,
budgets, resource filters, child grants and Authorized Surface Projections are
outside this selected subset. Their rejection is an SDK support boundary, not a
claim that those ASP features are invalid.
