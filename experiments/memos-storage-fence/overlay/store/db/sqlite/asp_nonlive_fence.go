//go:build asp_nonlive_fence

// This opt-in prototype never issues Grants or credentials.
package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	storepb "github.com/usememos/memos/proto/gen/store"
)

var errNonLiveRejected = errors.New("non-live candidate rejected")
var errNonLiveUncertain = errors.New("non-live commit uncertain")

type nonLiveMemosFence struct {
	db  *DB
	now func() time.Time
}
type nonLiveMemosCandidate struct {
	owner *nonLiveMemosFence
	id    int64
}

// installNonLiveMemosFence must only be used before tests on temporary databases.
// Triggers couple actual upstream SQL writes to invalidation without new auth routes.
func installNonLiveMemosFence(ctx context.Context, db *DB, now func() time.Time) (*nonLiveMemosFence, error) {
	tx, err := db.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	const schema = `
 CREATE TABLE IF NOT EXISTS asp_nonlive_revision(user_id INTEGER PRIMARY KEY, revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS asp_nonlive_candidate(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,session_id TEXT NOT NULL,
 revision INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS asp_nonlive_publication(candidate_id INTEGER PRIMARY KEY,kind TEXT NOT NULL CHECK(kind='symbolic'));
 `
	if _, err := tx.ExecContext(ctx, schema); err != nil {
		return nil, err
	}
	for _, spec := range []struct{ name, event, table, when, subject string }{
		{"user_update", "UPDATE", "user", "", "OLD.id"},
		{"user_delete", "DELETE", "user", "", "OLD.id"},
		{"refresh_insert", "INSERT", "user_setting", "NEW.key='REFRESH_TOKENS'", "NEW.user_id"},
		{"refresh_update", "UPDATE", "user_setting", "OLD.key='REFRESH_TOKENS' OR NEW.key='REFRESH_TOKENS'", "OLD.user_id"},
		{"refresh_delete", "DELETE", "user_setting", "OLD.key='REFRESH_TOKENS'", "OLD.user_id"},
	} {
		when := ""
		if spec.when != "" {
			when = " WHEN " + spec.when
		}
		statement := fmt.Sprintf(`CREATE TRIGGER IF NOT EXISTS asp_nonlive_%s AFTER %s ON %s%s BEGIN
  INSERT INTO asp_nonlive_revision(user_id,revision) VALUES(%s,1) ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
  UPDATE asp_nonlive_candidate SET state=CASE WHEN state='issued' THEN 'revocation_required' ELSE 'attempted' END
  WHERE user_id=%s AND state!='revocation_required';
  END`, spec.name, spec.event, spec.table, when, spec.subject, spec.subject)
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &nonLiveMemosFence{db: db, now: now}, nil
}

// currentSession reads actual tables through this transaction, not Store caches.
// User ID/token ID inputs here are fixtures, NOT evidence of authentication.
func (f *nonLiveMemosFence) currentSession(ctx context.Context, tx *sql.Tx, userID int32, tokenID string) (int64, error) {
	var status, raw string
	if err := tx.QueryRowContext(ctx, "SELECT row_status FROM user WHERE id=?", userID).Scan(&status); err != nil {
		return 0, errNonLiveRejected
	}
	if status != "NORMAL" {
		return 0, errNonLiveRejected
	}
	if err := tx.QueryRowContext(ctx, "SELECT value FROM user_setting WHERE user_id=? AND key='REFRESH_TOKENS'", userID).Scan(&raw); err != nil {
		return 0, errNonLiveRejected
	}
	tokens := &storepb.RefreshTokensUserSetting{}
	if err := protojsonUnmarshaler.Unmarshal([]byte(raw), tokens); err != nil {
		return 0, errNonLiveRejected
	}
	for _, token := range tokens.RefreshTokens {
		if token.TokenId == tokenID && token.ExpiresAt != nil && token.ExpiresAt.IsValid() {
			expiry := token.ExpiresAt.AsTime().UnixNano()
			if expiry > f.now().UnixNano() {
				return expiry, nil
			}
		}
	}
	return 0, errNonLiveRejected
}

func (f *nonLiveMemosFence) retain(ctx context.Context, userID int32, tokenID string) (*nonLiveMemosCandidate, error) {
	tx, err := f.db.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	expiry, err := f.currentSession(ctx, tx, userID, tokenID)
	if err != nil {
		return nil, err
	}
	var unresolved int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM asp_nonlive_candidate WHERE user_id=? AND state!='pending'", userID).Scan(&unresolved); err != nil {
		return nil, err
	}
	if unresolved != 0 {
		return nil, errNonLiveRejected
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO asp_nonlive_revision VALUES(?,0) ON CONFLICT DO NOTHING", userID); err != nil {
		return nil, err
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO asp_nonlive_candidate(user_id,session_id,revision,expires_at,state)
 SELECT ?,?,revision,?,'pending' FROM asp_nonlive_revision WHERE user_id=?`, userID, tokenID, expiry, userID)
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
	return &nonLiveMemosCandidate{owner: f, id: id}, nil
}

func (f *nonLiveMemosFence) attempt(ctx context.Context, ref *nonLiveMemosCandidate, beforeCommit func() error) error {
	if ref == nil || ref.owner != f {
		return errNonLiveRejected
	}
	tx, err := f.db.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE asp_nonlive_candidate SET state='attempted' WHERE id=? AND state='pending'
 AND NOT EXISTS(SELECT 1 FROM asp_nonlive_candidate other WHERE other.user_id=asp_nonlive_candidate.user_id AND other.id!=asp_nonlive_candidate.id AND other.state!='pending')`, ref.id)
	if err != nil {
		tx.Rollback()
		return err
	}
	n, err := result.RowsAffected()
	if err != nil || n != 1 {
		tx.Rollback()
		return errNonLiveRejected
	}
	if err := tx.Commit(); err != nil {
		return errNonLiveUncertain
	}
	tx, err = f.db.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var userID int32
	var tokenID, state string
	var expectedRevision, revision, deadline int64
	err = tx.QueryRowContext(ctx, `SELECT c.user_id,c.session_id,c.state,c.revision,r.revision,c.expires_at
 FROM asp_nonlive_candidate c JOIN asp_nonlive_revision r ON r.user_id=c.user_id WHERE c.id=?`, ref.id).Scan(&userID, &tokenID, &state, &expectedRevision, &revision, &deadline)
	if err != nil {
		return err
	}
	if state != "attempted" || revision != expectedRevision {
		return errNonLiveRejected
	}
	expiry, err := f.currentSession(ctx, tx, userID, tokenID)
	if err != nil {
		return err
	}
	if expiry < deadline || f.now().UnixNano() >= deadline {
		return errNonLiveRejected
	}
	if _, err := tx.ExecContext(ctx, "UPDATE asp_nonlive_candidate SET state='issued' WHERE id=?", ref.id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO asp_nonlive_publication VALUES(?,'symbolic')", ref.id); err != nil {
		return err
	}
	if beforeCommit != nil {
		if err := beforeCommit(); err != nil {
			return err
		}
	}
	if f.now().UnixNano() >= deadline {
		return errNonLiveRejected
	}
	// Precommit guard is not proof of valid-through-delayed-COMMIT evidence.
	if err := tx.Commit(); err != nil {
		return errNonLiveUncertain
	}
	return nil
}
