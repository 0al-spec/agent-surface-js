# Offline request–Grant composition

`OfflineRequestGrantComposition` validates one complete semantic request and
one complete selected Grant against the **same** genuine prepared proposal
manifest and host-supplied expectations. It reuses `OfflineSemanticGrantRequest`
and `OfflineSelectedGrant`, then rejects a Grant expiration later than the
requested expiration with `grant_expiry_exceeds_request`.

```ts
import { OfflineRequestGrantComposition } from '@0al/agent-surface';

new OfflineRequestGrantComposition(
  requestDocument, // JsonDocument: complete semantic request, not OAuth details
  grantDocument, // JsonDocument: complete Grant including its supplied hash
  preparedManifest,
  {
    subjectUser: 'user-1',
    runtimeId: 'runtime-1',
    agentId: 'agent-1',
    credentialAudience: 'https://app.example/agent-api',
    identityEvidence: independentlySuppliedIdentityDocument,
  },
).validate();
```

The snippet assumes previously validated manifest/schema inputs and explicit
host dependencies; it is not an issuer or an authenticated discovery example.
Construction captures values only. `validate()` snapshots and validates the
original JSON documents without mutating them. It returns no approved-record
capability, Grant, credential or admission decision.

## Supported relation

- Exactly one non-persisted proposal action, scope and action URL, as supported
  by the existing component validators. Both sides must match the same retained
  manifest; widening, substitution and empty selection reject.
- Exact runtime/agent/resource-server bindings, complete identity metadata,
  Compatibility Bearer profile, credential-release denial, required audit flags
  and manifest-derived Data Exposure projection remain mandatory.
- Grant expiry may equal or precede request expiry. Comparison uses the actual
  RFC 3339 instant, including timezone offsets and all fractional-second digits;
  different textual representations of an equal instant are accepted. RFC 3339
  `-00:00` means the UTC time is known but the local offset is unknown, so it is
  ordered as that UTC instant ([§4.3](https://www.rfc-editor.org/rfc/rfc3339.html#section-4.3)).
- No current-clock check: historically expired fixtures can pass this offline
  relation. Identity freshness/status and credential deadlines remain trusted
  host/runtime responsibilities, not results of this method.
- The closed constraints subset remains `expires_at` and `credential_release`.
  Resource filters and additional budget/constraint forms are **unsupported**,
  not silently stripped or treated as unconstrained authority. A future
  multi-action/filter attenuation contract requires a separate selected slice.
- Original request, Grant and identity documents each have a 256 KiB limit and
  strict JSON validation. Grant hashing includes the complete selected view;
  a freshly rehashed invalid Grant still rejects.

Host expectation values establish equality, not authenticity. The semantic
request has no subject field: its association with the authenticated user and
both consent decisions must be established separately by the trusted host.
This check does not prove identity, consent, lawful issuance, a current session,
revocation handling, application admission, privacy enforcement or full ASP
conformance. It adds no transport, issuer, registry or authority-store access.

## Evidence and source

Tests in `tests/offline-selected-grant.test.ts` reuse the selected-contract
fixtures: two unrelated applications, equal/shorter/later expiration, timezone
equivalence including `-00:00`, sub-millisecond extension, changed request
bindings, oversized-source preflight, rehashed invalid authority, strict JSON,
inert construction and repeat validation.
Existing component tests remain the detailed representation vectors.

The unchanged source lock is
`da550fde6f8be4ff0c1ded15524afb66c2912287`. Source requirements remain the
[Grant Object](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#grant-object)
and
[private issuance and consent](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-private-issuance-and-consent).
The canonical ADP backlog owns task completion; this offline method alone does
not close ADP-05 or activate Calcu's runtime binding.
