# Non-live Memos storage fence overlay

This connects the transaction experiment to **actual Memos SQLite tables and
existing Store/driver operations** at upstream commit
`2b2192d4e153bd04f1d325b60fd880cf00d68b01`. It is an isolated adoption experiment,
not an SDK export, upstream Memos patch proposal, authenticated issuer or live
integration. No credentials, Grant, agent or memo is created.

## Attachment and participating paths

The two Go files are guarded by `asp_nonlive_fence`. The installer is
package-private and called only by tests on migrated temporary databases.
Ordinary Memos builds exclude both files. Even tagged ordinary database setup
installs no `asp_nonlive_*` objects without explicit installation.

Opt-in SQLite triggers participate in the same transaction as upstream writes:

- `Store.RemoveUserRefreshToken`, `AddUserRefreshToken` and generic
  refresh-setting upsert/delete mutate the real `user_setting` row.
- `Store.UpdateUser` password, role or status changes mutate the real `user` row.
  This conservative prototype invalidates on every User update, even cosmetic.
- `Store.DeleteUser` and deletion of refresh settings invalidate linked records.
- Updating refresh settings advances a User-wide revision: adding a replacement
  token invalidates an old candidate before the separate removal of the old
  token. No old consent is migrated across rotation. This does not make the
  upstream rotation/password API itself atomic.

The adapter directly reads `user.row_status` and protobuf JSON in
`user_setting.REFRESH_TOKENS` inside the immediate SQLite transaction. It does
not use cached `Store.GetUser`/refresh getters for publication admission.
User/token IDs passed by tests are fixture identifiers, not verified
authentication. The only publication is a `kind='symbolic'` database marker.

Single-attempt state is persisted before a separate atomic publication
transaction. Failure leaves the candidate consumed; pending/fresh siblings
cannot bypass unresolved state. Postcommit invalidation marks
`revocation_required`, not confirmed credential revocation.

## Selected withdrawal control path (non-live)

The opt-in test control path adds an explicit sequence:

```text
beginWithdrawal → durable account freeze + invalidation
removeSession   → actual Store.RemoveUserRefreshToken (may fail; freeze remains)
reconcileWithdrawal → transaction reads exact session absence/expiry
                    → closes only its symbolic candidates + reconciles intent
```

No removal writer runs if intent persistence fails. Writer success, ignored errors,
cookie clearing or HTTP success cannot clear the freeze. Retention and attempts
check persisted state across database handles. Reopen/reinstallation preserves
it; `resumeWithdrawal` recovers an existing intent, never remints a candidate.
Missing rows or a missing/validly expired exact token are positive evidence;
active tokens, malformed/unknown protobuf JSON, missing expiry, cancelled reads
and SQL failures leave the freeze intact. Closing candidates and reconciling
the intent share one transaction. Closed references never become reusable.
Other sessions' unresolved candidates continue to block fresh work.

The removal wrapper uses a fresh Store cache over the same DB, not an arbitrary
caller-supplied writer. Tests also reproduce a stale original Store cache
reinserting the removed session while adding a replacement: reconciliation
rejects that actual DB state until removal is retried. This is **not** a remedy
for every upstream read-modify-write race or resurrection after reconciliation.
The absence/expiry observation holds at reconciliation's transaction boundary,
not as a permanent no-resurrection guarantee. Fixture account/token IDs are not
authentication, and closed symbolic records are not revoked real Grants.

Existing Memos HTTP auth callers are still unwrapped. Only this explicitly
participating test control path persists withdrawal intent before its writer;
the experiment does not qualify host-wide failed-logout safety.

## Reproduce on an isolated clean checkout

Use Go 1.27.1 and a disposable checkout of the exact commit above, not a running
Memos data directory or a working tree with local changes:

```sh
node experiments/memos-storage-fence/apply-overlay.mjs /path/to/clean-memos-checkout
cd /path/to/clean-memos-checkout
go test -race -tags=asp_nonlive_fence -run '^TestNonLiveMemosFence' -count=1 -timeout=2m ./store/db/sqlite
go vet -tags=asp_nonlive_fence ./store/db/sqlite
```

The overlay script verifies HEAD and cleanliness and refuses overwrite. It
does not modify existing tracked files, migrations, module dependencies or routes.
CI checks out pinned upstream and applies exactly the retained overlay.

## Evidence and remaining gates

Local validation on 2026-09-30 UTC: the retained overlay passed race-enabled
targeted tests and tagged `go vet` on a clean pinned upstream checkout with Go
1.27.1 (13 top-level tests, seven storage invalidation and five reconciliation
failure subcases). Ordinary
untagged SQLite package tests also passed. SDK check passed 449 tests plus
consumer/prototype checks; build and npm pack dry-run passed. Applying the
overlay a second time correctly rejected the now-dirty checkout. Local
`actionlint` remains unavailable; CI results are separate evidence.

Tests use real migrations and Store methods for logout-style removal, rotation
addition, password/role/archive changes, generic settings deletion and User
deletion. A second actual Store retains a stale refresh-token cache while the
adapter rejects the changed database. Independent database handles exercise
publication-first versus a competing actual session-removal writer; the
invalidation-first cases reject without publication. SQL-trigger failure checks
that mutation and invalidation roll back together and errors propagate.

This is storage-path evidence only. Tests do not invoke HTTP SignOut/RefreshToken,
authenticate a real User or exercise UI/consent. Upstream HTTP success can still
hide session persistence failure; host-wide adoption of the selected
freeze/reconciliation path remains open.
Triggers must remain present, in the selected SQLite database; no claims cover
other databases, deployment migrations, trigger removal/schema replacement,
external identity/policy or full writer qualification. No process crash test or
valid-through-delayed-COMMIT deadline proof is claimed.

The [fence design](../../docs/plans/memos-session-issuance-fence.md) retains all
other gates: exact consent, Runtime registration, independent identity/status,
external ordering, complete Grant/verifier custody, private delivery and actual
Action admission/revocation. Do not update source lock, ADP/maturity status or
activate issuance based on this overlay.
