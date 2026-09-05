# SDK agent instructions

Read [Elegant Objects policy](docs/engineering/elegant-objects.md) before SDK
implementation or refactoring. Apply it to tests and reviews as well.

Identify domain invariants before choosing classes. Keep protocol field names
unchanged. Constructor bodies only assign dependencies and values; validation
and I/O run in explicit behavior. Preserve caller-owned inputs.

Use the ASP revision and source digests in `spec-lock.json`. Update them only as
an explicit compatibility change, with upstream evidence and regression tests.
This SDK is an implementation, not a normative source or certification authority.

Keep changes focused. Run `npm run check`, `npm run build`, `npm pack --dry-run`,
and `git diff --check`. Push a focused branch and create/update its pull request;
include validation and limitations. Do not merge or publish without user direction.
Delegated agents must read this file and the EO policy before working.
