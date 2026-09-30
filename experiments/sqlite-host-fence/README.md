# Non-live SQLite host fence experiment

Status: isolated executable experiment, not an SDK export or Memos integration.
All database files are temporary test fixtures. There is no real User
authentication, consent, Grant, credential, agent, transport or memo creation.
The `publication` row is explicitly a symbolic marker, not execution authority.

## Implemented scope

- Actual SQLite WAL database and `_txlock=immediate`, matching the transaction
  configuration found in pinned Memos `store/db/sqlite/sqlite.go`.
- Participating fixture writers for account change, session withdrawal and
  atomic rotation; revision drift invalidates retained candidates.
- Transaction-scoped authoritative reads; retained active snapshots do not
  authorize a stale session.
- Durable attempt claim before publication: rejected/failed/uncertain attempts
  cannot transparently retry. Other pending or freshly retained candidates for
  that account cannot bypass unresolved state. This deliberately conservative
  experiment provides no unfreeze/recovery API.
- Atomic candidate transition plus symbolic publication; later invalidation
  records `revocation_required`, which is **not** confirmed credential revocation.
- Two separate database handles exercise both write orderings; tests also cover
  duplicate calls, expiry, SQL-trigger failure, lost acknowledgement and database
  reopen. Reopen is not an OS-kill/crash test.

Run with Go 1.27:

```sh
cd experiments/sqlite-host-fence
go test -race -count=1 ./...
go vet ./...
```

## Local validation (2026-09-30 UTC)

Go 1.27.1: `go test -race -count=1 -timeout=2m ./...` passed (14 top-level
tests, including four invalidation subcases); `go vet ./...` and `go mod verify`
passed. SDK `npm run check` passed 449 tests plus consumer/prototype checks;
build, package dry-run, package export check and `git diff --check` passed.
CI runs the experiment separately; local `actionlint` was unavailable.
These checks do not qualify live Memos or authority outside the fixture.

## Evidence limits / integration handoff

The normalized `account`/`session` fixture tables are **not Memos tables or a
migration**. No actual upstream writer calls this adapter. In particular,
Memos's two-step refresh rotation/password update, cached getters, generic
settings writes and logout error handling have not been changed or qualified.
Passing tests establish participating-fixture behavior only.

Real integration would require transaction-scoped Memos driver operations for
the writer map in the [fence design](../../docs/plans/memos-session-issuance-fence.md).
It also needs exact authenticated consent, independently verified identity and
external invalidation ordering, complete Grant/verifier custody, deadlines valid
through commit and current-state Action enforcement. The final precommit clock
guard here cannot prove validity through a delayed COMMIT.

Withdrawal rollback is observable and not reported as confirmed revocation.
The experiment does not implement the full host-wide freeze/reconciliation
policy for failed or uncertain logout; that remains a gate before real issuance.
The source-neutral candidate object checks fixture ownership, not authenticity.
No production security claim, Stage 1 completion, ADP closure, source-lock update,
Go SDK extraction, or live activation follows from these tests.
