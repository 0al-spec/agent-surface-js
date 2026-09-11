# Source compatibility: explicit user-managed retention

Decision: 2026-09-11, SDK PR #4 review follow-up. Preserve the endorsed Hello
design's `user_managed` declaration and update its normative source baseline;
do not silently replace it with a strict deletion promise.

- Previous revision: `951871c2d55db25d35512f29cc0970c69aa5cfd9`.
- Reviewed revision: [`b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691`](https://github.com/0al-spec/agent-surface/commit/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691), merged ASP PR #89.
- [Complete source diff](https://github.com/0al-spec/agent-surface/compare/951871c2d55db25d35512f29cc0970c69aa5cfd9...b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691).
- [spec-lock.json](../../spec-lock.json) contains the new full-module SHA-256 digests.

## Reviewed changes and effect on this SDK

| Source | Version change | Compatibility assessment |
| --- | --- | --- |
| Core | draft.1 → draft.2 | Exposure definition includes explicit user-managed handling. Queued/replayable events lose delivery authority on Grant end even without a source deletion deadline. Event execution is not implemented here. |
| Authorization | draft.2 → draft.3 | Mode compatibility uses current trusted adapter/policy knowledge; unsupported/unknown grammar blocks. No optimistic fallback. Candidate matching is not implemented here. |
| Privacy | draft.2 → draft.4 | Clarifies provenance/classification and adds the closed `{"mode":"user_managed"}` object, exact projection/consent and conjunction of derived-source obligations. No automatic deletion, training permission or authority waiver. Handling enforcement is not implemented here. |
| Evidence | draft.2 → draft.3 | Only version/dependency metadata changes. Canonical Object Hash Profile bytes, domains and self-field exclusions are unchanged. Existing hashing behavior/vectors remain applicable. |

Full versions use the `0.1.0-` prefix. Four selected modules remain the source
coverage for the `asp-jcs-sha-256` implementation; this is not complete dependency
closure or support for every profile named by those modules.

The historical Calcu comparison in [boundary-contract.md](../boundary-contract.md)
retains its old links/digests and is explicitly historical. The current lock
no longer claims that old revision as the Hello fixture's source. The mock-based
lock-checker tests intentionally retain their arbitrary historical SHA: they
test retrieval/digest failure behavior, not a compatible Hello manifest.

## Verification boundary

- The source checker fetches all four modules at the exact reviewed commit and
  verifies their complete byte digests; CI continues to run it independently.
- [Source compatibility tests](../../tests/source-compatibility.test.ts) reject
  regression to the old lock for this fixture, check independent positive
  manifest/Grant hashing-view vectors and reject reuse of a manifest hash after
  omitted, changed or extra retention members. Grant hashes also change.
- Golden hashes use ASCII-only objects without numbers. They were independently
  derived with Python `json.dumps(..., sort_keys=True, separators=(',', ':'))`,
  SHA-256 and unpadded base64url over `{"domain":...,"object":...}`. This agrees
  with JCS for these restricted values; it is not a general Python JCS encoder.
- The existing Hello hash remains unchanged. No fixture values were normalized,
  removed or given a fallback mode merely to make a test pass.
- Upstream [retention vectors](https://github.com/0al-spec/agent-surface/blob/b2d7e3627a08ec40ed7c0fd2f76370acc1c7e691/conformance/tests/test_user_managed_retention.py)
  exercise positive/negative grammar, exact projections, stale bindings and
  unsupported candidate facts. They qualify upstream schema/mock behavior, not
  SDK runtime enforcement. They can be run in the ASP virtual environment with
  `python -m unittest conformance.tests.test_user_managed_retention`.

Hashing is not grammar validation: a malformed exposure object with a freshly
computed hash can still be hashed by the generic SDK. The negative vectors here
reject stale integrity, not malformed retention as such. No manifest/Grant
validator, issuance, consent, agent compatibility, deletion or admission behavior
is added. Future implementation must reuse the pinned contract and its negative
vectors rather than infer support from the source lock or a matching digest.

The Hello provider path stays deliberately unconfigured. No live migration,
retention probe, new export, Calcu scope change or ADP gate completion follows
from this source update.
