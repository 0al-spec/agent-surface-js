// Package hostfence is a non-live SQLite experiment, not an ASP issuer.
// Rows model account/session writers; none are real credentials or Grants.
package hostfence

import (
	"context"
	"database/sql"
	"errors"
	"time"

	_ "modernc.org/sqlite"
)

var (
	ErrRejected  = errors.New("candidate rejected")
	ErrUncertain = errors.New("symbolic commit outcome uncertain")
)

// Candidate is an instance-owned reference, not a serializable approval.
// It represents a fixture candidate only: authentication/consent is not modeled.
type Candidate struct {
	owner *Fence
	id    int64
}

// Fence uses transaction-scoped reads, never cached principal values.
// Construction is inert; database opening/schema setup belong to the test host.
type Fence struct {
	db  *sql.DB
	now func() time.Time
}

func NewFence(db *sql.DB, now func() time.Time) *Fence {
	return &Fence{db: db, now: now}
}

// schema is deliberately fixture-only, not a Memos migration.
const schema = `
CREATE TABLE account(id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, active INTEGER NOT NULL);
CREATE TABLE session(id TEXT PRIMARY KEY, account_id INTEGER NOT NULL, revision INTEGER NOT NULL, active INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE candidate(id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL, session_id TEXT NOT NULL,
 account_revision INTEGER NOT NULL, session_revision INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','attempted','issued','revocation_required')));
CREATE TABLE publication(candidate_id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind='symbolic'));
`

// Retain snapshots actual fixture rows. It does not authenticate or obtain consent.
func (f *Fence) Retain(ctx context.Context, accountID int64, sessionID string) (*Candidate, error) {
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var accountRevision, sessionRevision, expiry int64
	err = tx.QueryRowContext(ctx, `SELECT a.revision,s.revision,s.expires_at FROM account a JOIN session s ON s.account_id=a.id
 WHERE a.id=? AND s.id=? AND a.active=1 AND s.active=1 AND s.expires_at>?
 AND NOT EXISTS(SELECT 1 FROM candidate c WHERE c.account_id=a.id AND c.state!='pending')`, accountID, sessionID, f.now().UnixNano()).Scan(&accountRevision, &sessionRevision, &expiry)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrRejected
	}
	if err != nil {
		return nil, err
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO candidate(account_id,session_id,account_revision,session_revision,expires_at,state) VALUES(?,?,?,?,?,'pending')`, accountID, sessionID, accountRevision, sessionRevision, expiry)
	if err != nil {
		return nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &Candidate{owner: f, id: id}, nil
}

// Attempt commits a durable single-attempt claim before the publication transaction.
// A crash/failure after that claim leaves attempted and cannot transparently retry.
// The hooks are package-private test interleavings, not application extension points.
func (f *Fence) Attempt(ctx context.Context, ref *Candidate) error {
	return f.attempt(ctx, ref, nil, nil)
}

func (f *Fence) attempt(ctx context.Context, ref *Candidate, beforeCommit func() error, afterCommit func() error) error {
	if ref == nil || ref.owner != f {
		return ErrRejected
	}
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE candidate SET state='attempted' WHERE id=? AND state='pending'
 AND NOT EXISTS(SELECT 1 FROM candidate other WHERE other.account_id=candidate.account_id AND other.id!=candidate.id AND other.state!='pending')`, ref.id)
	if err != nil {
		tx.Rollback()
		return err
	}
	n, err := result.RowsAffected()
	if err != nil || n != 1 {
		tx.Rollback()
		return ErrRejected
	}
	if err := tx.Commit(); err != nil {
		return ErrUncertain
	}

	tx, err = f.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var valid int
	err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM candidate c JOIN account a ON a.id=c.account_id JOIN session s ON s.id=c.session_id
 WHERE c.id=? AND c.state='attempted' AND s.account_id=a.id AND a.active=1 AND s.active=1
 AND a.revision=c.account_revision AND s.revision=c.session_revision
 AND c.expires_at>? AND s.expires_at>=c.expires_at`, ref.id, f.now().UnixNano()).Scan(&valid)
	if err != nil {
		return err
	}
	if valid != 1 {
		return ErrRejected
	}
	if _, err := tx.ExecContext(ctx, `UPDATE candidate SET state='issued' WHERE id=?`, ref.id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO publication(candidate_id,kind) VALUES(?,'symbolic')`, ref.id); err != nil {
		return err
	}
	if beforeCommit != nil {
		if err := beforeCommit(); err != nil {
			return err
		}
	}
	// Last precommit deadline guard. This is NOT proof of validity through delayed COMMIT.
	var expiry int64
	if err := tx.QueryRowContext(ctx, `SELECT expires_at FROM candidate WHERE id=?`, ref.id).Scan(&expiry); err != nil {
		return err
	}
	if f.now().UnixNano() >= expiry {
		return ErrRejected
	}
	if err := tx.Commit(); err != nil {
		return ErrUncertain
	}
	if afterCommit != nil {
		if err := afterCommit(); err != nil {
			return ErrUncertain
		}
	}
	return nil
}

// SessionWithdrawal represents one participating fixture writer, not Memos SignOut.
func (f *Fence) SessionWithdrawal(ctx context.Context, sessionID string) error {
	return f.withdraw(ctx, sessionID, nil)
}

func (f *Fence) withdraw(ctx context.Context, sessionID string, beforeCommit func() error) error {
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE session SET active=0,revision=revision+1 WHERE id=?`, sessionID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE candidate SET state=CASE WHEN state='issued' THEN 'revocation_required' ELSE 'attempted' END WHERE session_id=? AND state!='revocation_required'`, sessionID); err != nil {
		return err
	}
	if beforeCommit != nil {
		if err := beforeCommit(); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// AccountChange invalidates pending candidates even if the account remains active.
// It stands for password/role/status change in the fixture, not upstream UpdateUser.
func (f *Fence) AccountChange(ctx context.Context, accountID int64, active bool) error {
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE account SET revision=revision+1,active=? WHERE id=?`, active, accountID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE candidate SET state=CASE WHEN state='issued' THEN 'revocation_required' ELSE 'attempted' END WHERE account_id=? AND state!='revocation_required'`, accountID); err != nil {
		return err
	}
	return tx.Commit()
}

// SessionRotation is atomic replacement in the fixture (unlike upstream's two writes).
func (f *Fence) SessionRotation(ctx context.Context, oldID, newID string) error {
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `INSERT INTO session SELECT ?,account_id,1,1,expires_at FROM session WHERE id=? AND active=1`, newID, oldID)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil || n != 1 {
		return ErrRejected
	}
	if _, err := tx.ExecContext(ctx, `UPDATE session SET active=0,revision=revision+1 WHERE id=?`, oldID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE candidate SET state=CASE WHEN state='issued' THEN 'revocation_required' ELSE 'attempted' END WHERE session_id=? AND state!='revocation_required'`, oldID); err != nil {
		return err
	}
	return tx.Commit()
}
