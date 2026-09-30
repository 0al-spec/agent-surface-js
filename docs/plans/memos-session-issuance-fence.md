# Memos session/account issuance fence

**Status: design proposal; not implemented or host-qualified.**
Prepared 2026-09-30 UTC. Follows the
[host-adapter selection](host-auth-adapter-selection.md). This layer maps
source lifecycle and proposes an ordering boundary; it does not activate an
issuer, change Memos, or complete any SDK/ADP/conformance gate.

## Scope and topology

Design target: one trusted host process, one SQLite authority database, one
ordinary authenticated Memos account and exact server-backed refresh session.
MySQL/Postgres, replicas, direct administrative SQL, and multiple writers outside
the selected boundary are unsupported until separately qualified. This is a
proposed deployment restriction, not a restriction already enforced by Memos.

Memos remains a Go application. This design records language-neutral host
obligations; it neither runs the TS SDK inside Memos nor extracts a Go SDK.
No new endpoints, tables, credentials or real issuance are implemented here.

## Source-backed producer/writer map

Source baseline is upstream
[`2b2192d4e153bd04f1d325b60fd880cf00d68b01`](https://github.com/usememos/memos/tree/2b2192d4e153bd04f1d325b60fd880cf00d68b01).
Inspected tracked files below have no local diff from HEAD. The local
`server/aspdemo` prototype is not used as evidence of an issuance fence.
This is a scoped static map, not proof that deployment has no other writers.

| Source / producer | Observed behavior | Required participation in proposed boundary |
| --- | --- | --- |
| `server/auth/authenticator.go`, `AuthenticateByRefreshToken` | Parses credential; checks stored token, expiry and User; returns token ID. JWT bearer resolution reloads User but does not check this exact session. | Resolve host-owned account/session reference. Re-read authoritative rows at commit without cached getters; JWT/PAT alone cannot establish selected session. |
| `server/api/v1/auth_service_session.go`, `doSignIn` | Adds refresh metadata; logs persistence error but can continue to return authentication output. | Failed persistence must not establish an issuer-eligible session. Login is not consent. |
| Same file, `SignOut` | Removes refresh token when available; ignores removal error; clears cookie. | Persist removal and corresponding authority invalidation together. Cookie clearing or HTTP success is not confirmation of revocation. |
| Same file, `RefreshToken` | Adds new token, then separately removes old; removal error is logged. | Atomic selected-session replacement plus invalidation of old approved records. No approved-record migration to the new token. |
| `server/api/v1/user_service.go:420–466` | Updates password/role/status; password change then separately removes other sessions, preserving caller session where identified. | Account authority version changes in the account transaction. For this bounded design, password/role/status changes invalidate pending records even if a browser session is preserved. |
| `store/user.go:159–176,201–238` | Updates/deletes via driver; User reads can return process cache. | Commit checks use database transaction reads, not `GetUser` cache. Update/delete paths join account invalidation ordering. |
| `store/user_setting.go:44–62,86–125,149–269` | Generic settings writes/deletes; cached reads; refresh helpers hold a process-local write mutex. | Every refresh-setting write/delete path must join the same authority boundary; process mutex and cache invalidation are insufficient. |
| `store/db/sqlite/user.go:21–88`, `user_delete.go:24–74` | Account update/delete already use their own driver transactions. | Reuse transaction-scoped operations, not nested independent transactions; atomically invalidate linked authority with account mutation. |

Ownership to obtain before implementation: Memos integration owner for auth/API
writers; storage owner for transaction/cache paths; ASP host owner for approved
records, exact consent and admission. These are required responsibilities, not
claims that named maintainers have approved this design. Policy writers and
external identity owners remain outside this completed inventory.

## Proposed transaction contract

Do not mint authority from a successful authentication read. Resolve an opaque
host reference only on the trusted control path. Bind it to exact account,
session identity, host instance, authoritative versions and applicable expiry.
The reference contains no raw authentication credential and is not a public
browser/model capability.

Proposed durable state adds account authority and session generations, approved
records, complete Grant/verifier records and revocation-required state in the
same database. Exact schema/API remains open. Required behavior:

1. Take the selected database's write-serialization boundary before final
   authoritative reads. Qualify a transaction mode equivalent to SQLite
   immediate write acquisition. Subsequent inspection found pinned Memos
   `store/db/sqlite/sqlite.go` already sets `_txlock=immediate` in its DSN.
   That supplies a concrete configuration to reuse, not proof that all
   authority checks and publication currently share one transaction.
2. Read User/session directly in that transaction: account exists and is active,
   exact session exists, versions match, deadlines hold. Check retained exact
   material and both authenticated decisions. In-memory values/caches can aid
   display but cannot authorize commit.
3. Resolve every other mandatory authority under its qualified ordering contract.
   Runtime, identity, policy, immutable snapshot/schema and consent cannot be
   inferred from Memos authentication or the local database lock. No network
   status fetch under a lock is automatically an external fence.
4. Atomically consume the approved record once and commit complete Grant,
   credential verifier, exact audience and lifecycle state. The record permits
   at most one issuance attempt: aborted/uncertain attempts cannot transparently
   retry. Durable attempt recording/recovery is a separate state transition
   before the consume/commit transaction; crash semantics must be qualified.
5. Treat successful durable commit as the proposed publication linearization
   point. Deadline evidence must remain valid through it; a timestamp checked
   before a potentially delayed commit is insufficient. Clock assumptions,
   bounded commit validity or another valid-through mechanism remain an explicit
   unresolved implementation gate, not a guarantee made by this design.
6. Only after commit, deliver privately to the registered mediator. Concurrent
   postcommit invalidation freezes undelivered authority pending confirmed
   revocation; it cannot be ignored because issuance won the earlier race.
   No credential enters browser/model/logs or persisted verifier state.

Session removal/rotation and account changes acquire the same database boundary,
mutate authoritative state and invalidate matching pending records atomically.
For committed records they persist revocation-required state. Actual rejection
at all Action enforcement points must be separately implemented/qualified;
setting a database flag does not prove credential revocation.

All relevant writers must participate. Bypassing database writes, independently
cached authority, inability to couple existing driver transactions, or an
unqualified external source stops implementation/activation. Polling and a
new ASP-only mutex do not repair the missing order.

## Race orderings

```text
Invalidation first
  session/account writer: acquire boundary → invalidate → commit → release
  issuance: acquire boundary → fresh read finds drift → reject
  outcome: no Grant/verifier commit or private credential delivery

Issuance first (all mandatory authority valid through commit)
  issuance: acquire boundary → exact revalidation → consume+commit → release
  session/account writer: acquire boundary → invalidate → commit → release
  outcome: one issuance; subsequent admission/revocation applies
           undelivered authority freezes; no automatic second issuance
```

These diagrams state required ordering, not executed concurrency evidence.
Failed logout persistence is neither successful invalidation nor proof of a
valid intent to issue: affected host flows must freeze while the outcome is
unresolved. New issuance requires authoritative reconciliation and fresh consent
where material changed; the old approved record is never repaired.

## Acceptance vectors to implement later

| Vector | Required observation |
| --- | --- |
| Missing/expired/revoked session, archived/deleted account, copied/foreign host reference, JWT/PAT without exact session | Reject without Grant/verifier publication or credential delivery. |
| Session rotation, password/role/status change after consent | Old record invalid; fresh exact decisions required, including when caller's browser session survives. |
| Store unavailable; logout/rotation persistence failure | No confirmed revocation claim; freeze affected flows, reconcile before fresh issuance. |
| Cache says active but authoritative transaction reads revoked | Reject; show cached getters did not authorize commit. |
| Invalidation commits first versus issuance commits first | First ordering rejects; second permits exactly one valid commit then enforces subsequent invalidation. |
| Duplicate attempt; crash after attempt registration/before commit; ambiguous commit/delivery | No automatic retry/remint; durable recovery distinguishes no publication from possible publication and freezes uncertain authority. |
| Deadline crosses while transaction/commit delayed | No authority published with evidence invalid at the linearization point. |
| Generic settings/account writer, direct SQL or second process bypass | Refuse qualification unless writer coverage/topology restriction is actually enforced. |
| Restart with retained state or old-credential invalidation fallback | Prove actual enforcement-point behavior separately; otherwise startup/issuance blocked. |

An isolated [SQLite experiment](../../experiments/sqlite-host-fence/README.md)
now exercises a subset against actual temporary SQLite transactions and
normalized fixture rows, not Memos tables/writers. It is not host qualification.
The follow-up [Memos storage overlay](../../experiments/memos-storage-fence/README.md)
attaches opt-in triggers to actual Memos tables and tests existing Store/driver
writers on migrated temporary databases. It does not invoke live/HTTP routes,
authenticate users or qualify every authority dependency. No further live,
retention or process-crash probes were added. The full acceptance matrix above
remains planned evidence; selected storage tests do not establish full writer
coverage, authenticated consent or external invalidation ordering.

The next non-live overlay slice implements a **selected test withdrawal path**:
persist freeze before calling the actual removal writer, retain it on failure
or merely successful return, and reconcile only on authoritative exact-session
absence/valid expiry. Its durable intent survives database reopen; reconciliation
closes only that session's symbolic candidates atomically and cannot repair an
old reference. Other unresolved sessions remain blocking. Tests reproduce
stale-cache token resurrection and reject reconciliation in that state, as well
as malformed/unknown evidence, unavailable storage and reconciliation rollback.
These results do not wrap existing HTTP auth routes or prove all-writer safety;
session resurrection after reconciliation and upstream read-modify-write ordering
still require a separate writer-contract decision. No real Grant or credential
revocation is inferred from closing symbolic experiment records.

## Remaining gates and next decision

Current result: source-backed map plus a **conditional design**, not a qualified
adapter. Implementation depends on owner-approved topology/writer changes,
transaction-scoped storage, durable single-attempt handling, valid-through-commit
deadline proof, two exact consent lifecycles, Runtime registration, external
identity/policy ordering, private delivery/custody and current Action enforcement.

Next bounded decision: qualify a non-live refresh-setting writer contract that
prevents stale-cache/read-modify-write resurrection, then determine how existing
host auth callers would adopt withdrawal intent. Do not activate live issuance
or add a parallel auth registry that cannot fence those writers. Preserve the
SDK source lock and canonical ADP status.
All normative obligations remain in the
[consent-bound issuance plan](consent-approved-request-issuance-slice.md) and its
pinned ASP references; this design neither relaxes them nor makes Memos qualified
for the proposal-only SDK subset (the existing Memos demo is a commit action).
