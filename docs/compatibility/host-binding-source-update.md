# Source compatibility: Host-Provisioned Bearer Binding

Decision: 2026-09-12, SDK PR #10. Advance the SDK source baseline after ASP
PR #92 merged; preserve existing runtime behavior and historical evidence.
This is source compatibility and an implementation target, not implemented
manifest/Grant validation, issuance, transport or conformance qualification.

## Exact revisions

- Previous SDK pin: `b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691`.
- Reviewed PR head: `ea3b2160fd5edab4b7d7d18abd4f098b46088351`.
- New pin: [`da550fde6f8be4ff0c1ded15524afb66c2912287`](https://github.com/0al-spec/agent-surface/commit/da550fde6f8be4ff0c1ded15524afb66c2912287),
  merge commit of [ASP PR #92](https://github.com/0al-spec/agent-surface/pull/92).
- [Full upstream comparison](https://github.com/0al-spec/agent-surface/compare/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691...da550fde6f8be4ff0c1ded15524afb66c2912287).

All five module diffs were reviewed. The merge commit and reviewed PR head have
identical module bytes. `spec-lock.json` contains the new complete byte digests;
the source checker retrieves those exact GitHub revision URLs and verifies each
digest, without redirects or a moving-branch fallback.

## Compatibility assessment

| Module | Exact version change | Change and effect on existing SDK behavior |
| --- | --- | --- |
| Core | `0.1.0-draft.2` → `0.1.0-draft.3` | Adds the closed Host-Provisioned Bearer descriptor, endpoint-role and discovery requirements. No existing hashing or exposure helper becomes a complete manifest validator. |
| Authorization | `0.1.0-draft.3` → `0.1.0-draft.5` | Adds private issuance/consent fence, bearer custody, self-validation, revocation and qualification requirements. Exact Grant method is `bearer`, distinct from profile `compatibility_bearer`. No issuer, Grant semantic validator or transport is exported by this update. |
| Privacy | `0.1.0-draft.4` → `0.1.0-draft.6` | Version/dependency metadata only; exposure grammar and all three retention modes are unchanged. |
| Evidence | `0.1.0-draft.3` → `0.1.0-draft.5` | Version/dependency metadata only; canonical hash domains, byte encoding, ordering and self-field exclusions are unchanged. |
| Safe Effects | `0.1.0-draft.3` → `0.1.0-draft.5` | Version/dependency metadata only; Action execution/schema requirements are unchanged. |

The new binding is additive to the selected source text. Existing JSON/JCS,
exposure and bounded offline schema behavior remains compatible without a
production-code change. The SDK does not yet accept the binding as an
operational configuration. In particular, a generic hash over a malformed Grant
still succeeds: semantic rejection belongs to the forthcoming Grant validator.

## Deliberately bounded source coverage

Keep the existing five modules and `asp-jcs-sha-256` lock profile. The profile
name describes the existing implementation baseline, not a claim of support for
the new authorization binding. No source is silently added or removed, and the
checker still rejects missing, duplicate, unexpected and corrupted sources.

The five modules contain the binding's relevant manifest, Grant, identity,
consent, session, disclosure, Action and evidence text, and cover one another's
declared exact module dependencies at this revision. Their presence does not
prove semantic implementation of those requirements. No Conformance registry
or ASP-over-MCP implementation is selected by this source update. Before using
conformance roles or imported vectors as executable acceptance evidence, review
their exact source coverage separately and update the lock/checker/tests as
needed. Module dependency coverage is not complete selected-role implementation
or conformance evidence.

## Regression and verification evidence

- The exact lock regression asserts the reviewed merge commit and all five
  complete digests, independently of a value loaded from the lock under test.
- Existing JSON/hash, exposure, Hello retention and offline-schema tests remain
  unchanged in behavior; their original golden hashes are preserved.
- Binding-fragment hashing regressions distinguish descriptor/profile/method
  bytes and mutations. They do not turn a freshly hashed invalid label into
  a rejected Grant or claim an operational manifest fixture.
- Golden fragment hashes use an independent restricted derivation: ASCII-only
  strings/objects, sorted compact JSON, SHA-256 and unpadded base64url over the
  existing `{domain, object}` envelope. This is valid for these fixtures, not
  a general-purpose Python JCS implementation.
- Run `node scripts/check-spec-lock.mjs`, `npm run check`, `npm run build`,
  `npm pack --dry-run` and `git diff --check` for this checkpoint. Source-byte
  verification and test success are not identity, consent or authority evidence.

Historical proposals and comparison documents retain their original immutable
links. Their supersession notes point here rather than rewriting past decisions
as though they used this revision.

Next: the [implementation matrix](host-binding-implementation-matrix.md), starting
with the bounded offline selected-manifest slice. Calcu activation, principal
integration, transactional fencing, HTTPS controls, base receipts and session
behavior remain separate implementation gates with per-slice negative tests.
