# Offline proposal manifest

This slice composes retained manifest content, declaration grammar, exposure and
offline schema checks. It targets the Host-Provisioned Bearer declaration in
ASP `da550fde6f8be4ff0c1ded15524afb66c2912287`; it is not a new wire profile.
The [source checkpoint](compatibility/host-binding-source-update.md) remains
unchanged.

## Boundary

Preparation validates a deliberately restricted representation. It does not
authenticate a publisher, discover a current surface, negotiate identity
verification, issue a Grant, enforce disclosure, start a session or call a
handler. An accepted manifest is not permission to activate the binding.

The application supplies original manifest bytes, immutable local schema
resources and its own business declarations. No schema is downloaded. Input
schema hashes commit to their exact content; a surface hash commits to schema
URIs and explicitly declared hashes, not otherwise unhashed schema content.
Local resource retention does not establish publisher authenticity.

The normative basis is the pinned
[authentication descriptor](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/core.md#host-provisioned-bearer-authentication-descriptor),
[binding](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/authorization.md#host-provisioned-bearer-binding),
[proposal-only invariant](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/core.md#proposal-only-surface-mode)
and [Data Exposure Contract](https://github.com/0al-spec/agent-surface/blob/da550fde6f8be4ff0c1ded15524afb66c2912287/drafts/modules/privacy.md#data-exposure-contract).

Supported declarations are narrower than ASP as a whole. Unsupported fields or
features must be rejected, never stripped before hashing or silently treated as
enforced. Existing `SurfaceSnapshot.hash()` retains its content-only behavior,
including its optional supplied hash; this new acceptance path requires the
supplied manifest hash.

## Selected subset

- All required base containers plus `compatibility`; exact protocol, dialect,
  `proposal_only` mode and closed Host-Provisioned Bearer `auth` descriptor.
- One application-chosen action and one resolving scope. Non-persisted `propose`,
  `risk: propose`, `approval: none`, `side_effect: false`, non-empty declared
  `operation_id`. Cross-version identity stability remains a publisher obligation.
  `execution.persisted` may be absent or `false`, exactly as the pinned binding
  permits; absence is not repaired by inserting a field.
  No resource reads, effects, companions or idempotency extensions.
- Both action schemas and an `input_schema_hash` are required here. Requiring
  this hash is an SDK restriction: ASP does not require it for every
  non-persisted proposal. There is no invented `output_schema_hash`.
- One `grant.revoked` control event, complete exposure declarations and a
  bounded `at_least_once` delivery advertisement. Budget and application-event
  variants are outside this slice, not universally forbidden by ASP.
- Base audit declaration with hash profile, retained receipt schema and a
  non-weakened advertised field inventory. This is not receipt validation or
  proof that the supplied schema enforces normative receipt semantics.
- One atomic Passport-format identity advertisement, checked against explicit
  expected host metadata. Format/digest identifiers are fixed; deployment-specific
  verification, key-binding, freshness and status identifiers are not inferred
  from the manifest. This comparison does not install or qualify a verifier.

Closed member sets, a single action/scope/event, HTTPS schema resource keys,
capacity caps and conservative URL spellings are SDK restrictions, not new RFC
requirements. Another valid ASP configuration may be rejected as unsupported.
No extension field is silently ignored to make it fit.

## API

```ts
import {
  JsonDocument,
  OfflineProposalManifest,
  OfflineSchemaResources,
} from '@0al/agent-surface';

// Original bytes and exact URI-keyed schemas supplied by the trusted host.
const manifest = new OfflineProposalManifest(
  new JsonDocument(manifestText),
  new OfflineSchemaResources(schemaResources),
  new JsonDocument(expectedIdentityEntryText),
).prepare();

manifest.validateInput(actionId, new JsonDocument(inputText));
manifest.validateOutput(actionId, new JsonDocument(outputText));
console.log(manifest.hash());
```

The variables above are host inputs, not SDK-generated defaults. The third
argument is one complete expected identity advertisement entry, not an identity
artifact. Obtain it from independent host configuration; copying the untrusted
manifest entry into this argument defeats the selection check. It is still
metadata, not authenticated trust or an implementation of any named verifier.

Preparation checks and resolves action input/output, event and receipt schema
references against the same retained offline resource set. Successful
preparation is cached on that object; failures do not publish a prepared view.
`validateInput`/`validateOutput` require the exact selected action ID. They check
business-schema assertions only, not request correlation or semantic agreement
between inputs and outputs. No handler is connected by these methods.

Capacity limits are SDK choices: 256 KiB manifest and expected-identity
documents, 256 data classes, one identity entry with at most eight identifiers
per profile array, artifact advertisement at most 262,144 bytes, at most 64
audit field names, and positive delivery values at most 1,000,000. The existing
[schema resource limits](offline-schemas.md) also apply to the entire supplied
set. No extra resources bypass schema preparation just because they are unused.

Endpoint spellings must be canonical absolute HTTPS URLs without userinfo,
query, fragment, backslash or URL-normalizing syntax. Selected routes must
belong to the issuer origin and use distinct paths; the two revocation members
are the deliberate exception. The logical audience is supplied independently
and cannot alias a selected route in this subset. Static checks cannot detect
server-side rewrites or prove an endpoint's behavior.

## Evidence and remaining work

`tests/offline-proposal-manifest.test.ts` covers calculator and greeting
declarations with different business schemas; original-JSON failures; required
and stale hashes; freshly rehashed invalid auth/action/endpoint declarations;
audience/management route collisions; missing and rebound schemas; exposure,
identity and audit failures; repeated failed preparation; and immutable retained
bindings. Constructors are tested for absence of parsing. Existing schema,
exposure and source-lock tests remain regression evidence for their own layers.

Run `npm run check`, `npm run build`, `npm pack --dry-run`, and
`git diff --check`. Source compatibility remains checked by
`node scripts/check-spec-lock.mjs` against the unchanged exact revision.

Fixtures are synthetic application declarations, not deployed applications or
certified schemas. Passing instance validation establishes only the assertions
of the retained business schema. It does not prove that an agent understood a
natural-language request or that a handler is side-effect-free.

Static HTTPS URL checks cannot discover server routing aliases, authenticate
TLS or prove that a URL is actually served. Identity advertisement validation
does not verify an artifact, status, trust root or deployment implementation.
Receipt and event metadata do not implement receipt production, revocation or
delivery. Those are separate runtime gates in the
[implementation matrix](compatibility/host-binding-implementation-matrix.md).

After this offline slice, the next bounded step is complete selected Grant
values and issuer-derived exposure projection. Calcu activation remains deferred
until the applicable identity, consent, transport and lifecycle checks exist.
