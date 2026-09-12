# Offline semantic Grant request

Status: implementation follow-up under the exact ASP source lock
`da550fde6f8be4ff0c1ded15524afb66c2912287`.

This slice validates one complete candidate-specific semantic Agent Grant
request for the selected Host-Provisioned Bearer subset. It computes the ASP
`grant-request/v1` integrity hash and derives the request's effective Data
Exposure projection from an already prepared manifest. It does not approve,
submit or issue the request.

## Boundary

The direct input is the closed semantic request hashing view, not an OAuth
`authorization_details` object and not a private issuance wire message. It
contains the selected location, action, scope, delegate and complete identity
evidence, exact application/surface tuple, supported constraints, requested
credential profile and base receipt requirements.

Authorization-server outputs are invalid request members. In particular, the
request cannot contain `grant_id`, `grant_hash`, `subject`,
`credential_binding`, `data_exposure` or a raw credential. RFC 9396 `type` is
also rejected by this direct validator rather than silently removed. The only
supported credential profile is `compatibility_bearer`; credential-release is
exactly denied.

The derived exposure projection is deliberately outside the semantic request
hashing view. It is recomputed from the exact retained manifest and includes
the selected proposal action and every advertised control event, even when an
event declares an empty class set. The projection is input to a later Consent
Preview and issuer derivation; it is not authority by itself.

## What successful preparation does not prove

- The publisher, application user, Runtime or agent was authenticated.
- Identity evidence is valid, fresh or active.
- The request came from a trusted runtime or represents a user's intent.
- A Consent Preview was shown, understood or confirmed.
- The Grant Issuer approved the request.
- The expiration is current under a trusted clock.
- A Grant or credential was issued, stored, delivered or activated.
- Any current authority, session, transport, admission or handling policy was
  enforced.

The public expectation values are independently supplied integrity inputs.
They must not be relabeled as authenticated state. The Host-Provisioned Bearer
issuer still accepts only a host-owned reference to an approved request record;
this class does not define that private capability or a serialized issuance
request/response.

## Normative basis

- [Semantic Grant Request Hash](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#semantic-grant-request-hash)
- [Host-Provisioned Bearer Binding](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-binding)
- [Private Issuance and Exact Consent](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-private-issuance-and-consent)
- [Consent Preview Contract](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/safe-effects.md#consent-preview-contract)
- [Data Exposure Contract](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/privacy.md#data-exposure-contract)
- [Canonical Object Hash Profile](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/evidence.md#canonical-object-hash-profile)

General OAuth requests, multiple candidates, resource filters, budgets,
Proof-Bound credentials, runtime identity, attestation, purpose binding,
remote-processing, training-use, approval-receipt signing, subdelegation and
Authorized Surface Projections are outside this selected SDK subset. Rejection
of those features is an implementation boundary, not a claim that ASP forbids
them.
