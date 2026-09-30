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
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
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

type nonLiveMemosWithdrawal struct {
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
 CREATE TABLE IF NOT EXISTS asp_nonlive_withdrawal(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,session_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('frozen','reconciled')));
 CREATE UNIQUE INDEX IF NOT EXISTS asp_nonlive_frozen_user ON asp_nonlive_withdrawal(user_id) WHERE state='frozen';
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
		// Refresh only this explicitly installed experiment's triggers atomically.
		if _, err := tx.ExecContext(ctx, "DROP TRIGGER IF EXISTS asp_nonlive_"+spec.name); err != nil {
			return nil, err
		}
		statement := fmt.Sprintf(`CREATE TRIGGER asp_nonlive_%s AFTER %s ON %s%s BEGIN
  INSERT INTO asp_nonlive_revision(user_id,revision) VALUES(%s,1) ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
  UPDATE asp_nonlive_candidate SET state=CASE WHEN state='issued' THEN 'revocation_required' ELSE 'attempted' END
  WHERE user_id=%s AND state NOT IN ('revocation_required','closed');
  END`, spec.name, spec.event, spec.table, when, spec.subject, spec.subject)
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return nil, err
		}
	}
	// Persistent withdrawal rows are tombstones even after reconciliation.
	// Guard both protojson spellings; OR (not COALESCE) checks either ID alias.
	// Existing Store caches and generic upserts cannot reinsert withdrawn IDs.
	for _, event := range []string{"INSERT", "UPDATE"} {
		name := "asp_nonlive_no_resurrection_" + event
		if _, err := tx.ExecContext(ctx, "DROP TRIGGER IF EXISTS "+name); err != nil {
			return nil, err
		}
		statement := fmt.Sprintf(`CREATE TRIGGER %s BEFORE %s ON user_setting
 WHEN NEW.key='REFRESH_TOKENS' BEGIN
 SELECT CASE WHEN NOT json_valid(NEW.value) THEN RAISE(ABORT,'invalid refresh evidence') END;
 SELECT CASE WHEN EXISTS (
 SELECT 1 FROM asp_nonlive_withdrawal w JOIN (
 SELECT value FROM json_each(NEW.value,'$.refreshTokens') UNION ALL
 SELECT value FROM json_each(NEW.value,'$.refresh_tokens')) token
 WHERE w.user_id=NEW.user_id AND
 (json_extract(token.value,'$.tokenId')=w.session_id OR json_extract(token.value,'$.token_id')=w.session_id)
 ) THEN RAISE(ABORT,'withdrawn session cannot be restored') END;
 END`, name, event)
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
	if err := (protojson.UnmarshalOptions{}).Unmarshal([]byte(raw), tokens); err != nil {
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
	if err := tx.QueryRowContext(ctx, `SELECT
 (SELECT COUNT(*) FROM asp_nonlive_candidate WHERE user_id=? AND state NOT IN ('pending','closed')) +
 (SELECT COUNT(*) FROM asp_nonlive_withdrawal WHERE user_id=? AND state='frozen')`, userID, userID).Scan(&unresolved); err != nil {
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
 AND NOT EXISTS(SELECT 1 FROM asp_nonlive_candidate other WHERE other.user_id=asp_nonlive_candidate.user_id AND other.id!=asp_nonlive_candidate.id AND other.state NOT IN ('pending','closed'))
 AND NOT EXISTS(SELECT 1 FROM asp_nonlive_withdrawal w WHERE w.user_id=asp_nonlive_candidate.user_id AND w.state='frozen')`, ref.id)
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

// beginWithdrawal durably freezes this fixture account BEFORE invoking a writer.
// Fixture IDs are not authentication; only this selected test control path participates.
func (f *nonLiveMemosFence) beginWithdrawal(ctx context.Context, userID int32, tokenID string) (*nonLiveMemosWithdrawal, error) {
	tx, err := f.db.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := f.currentSession(ctx, tx, userID, tokenID); err != nil {
		return nil, err
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO asp_nonlive_withdrawal(user_id,session_id,state)
 SELECT ?,?,'frozen' WHERE NOT EXISTS(SELECT 1 FROM asp_nonlive_withdrawal WHERE user_id=? AND state='frozen')`, userID, tokenID, userID)
	if err != nil {
		return nil, err
	}
	n, err := result.RowsAffected()
	if err != nil || n != 1 {
		return nil, errNonLiveRejected
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO asp_nonlive_revision VALUES(?,1)
 ON CONFLICT(user_id) DO UPDATE SET revision=revision+1`, userID); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE asp_nonlive_candidate
 SET state=CASE WHEN state='issued' THEN 'revocation_required' ELSE 'attempted' END
 WHERE user_id=? AND state NOT IN ('revocation_required','closed')`, userID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, errNonLiveUncertain
	}
	return &nonLiveMemosWithdrawal{owner: f, id: id}, nil
}

func (f *nonLiveMemosFence) withdrawal(ctx context.Context, tx *sql.Tx, ref *nonLiveMemosWithdrawal) (int32, string, error) {
	if ref == nil || ref.owner != f {
		return 0, "", errNonLiveRejected
	}
	var userID int32
	var tokenID string
	if err := tx.QueryRowContext(ctx, `SELECT user_id,session_id FROM asp_nonlive_withdrawal
 WHERE id=? AND state='frozen'`, ref.id).Scan(&userID, &tokenID); err != nil {
		return 0, "", err
	}
	return userID, tokenID, nil
}

// resumeWithdrawal recovers an existing frozen intent, never creates one.
// User IDs remain test-control-path fixtures, not public capabilities.
func (f *nonLiveMemosFence) resumeWithdrawal(ctx context.Context, userID int32) (*nonLiveMemosWithdrawal, error) {
	var id int64
	if err := f.db.db.QueryRowContext(ctx, "SELECT id FROM asp_nonlive_withdrawal WHERE user_id=? AND state='frozen'", userID).Scan(&id); err != nil {
		return nil, err
	}
	return &nonLiveMemosWithdrawal{owner: f, id: id}, nil
}

// removeSession uses the same real setting/upsert SQL in one immediate transaction. Its
// return value NEVER clears the freeze. It is safe to retry session removal,
// not an issuance attempt; reconciliation is a separate authoritative read.
func (f *nonLiveMemosFence) removeSession(ctx context.Context, ref *nonLiveMemosWithdrawal) error {
	tx, err := f.db.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	userID, tokenID, err := f.withdrawal(ctx, tx, ref)
	if err != nil {
		return err
	}
	tokens, err := f.refreshTokens(ctx, tx, userID)
	if err != nil {
		return err
	}
	kept := &storepb.RefreshTokensUserSetting{}
	for _, token := range tokens.RefreshTokens {
		// Expired history must not carry an earlier tombstoned ID into a write.
		if token.TokenId != tokenID && (token.ExpiresAt == nil || !token.ExpiresAt.IsValid() || token.ExpiresAt.AsTime().After(f.now())) {
			kept.RefreshTokens = append(kept.RefreshTokens, token)
		}
	}
	if err := f.writeRefreshTokens(ctx, tx, userID, kept); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return errNonLiveUncertain
	}
	return nil
}

func (f *nonLiveMemosFence) refreshTokens(ctx context.Context, tx *sql.Tx, userID int32) (*storepb.RefreshTokensUserSetting, error) {
	var raw string
	tokens := &storepb.RefreshTokensUserSetting{}
	err := tx.QueryRowContext(ctx, "SELECT value FROM user_setting WHERE user_id=? AND key='REFRESH_TOKENS'", userID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return tokens, nil
	}
	if err != nil {
		return nil, err
	}
	if err := (protojson.UnmarshalOptions{}).Unmarshal([]byte(raw), tokens); err != nil {
		return nil, err
	}
	return tokens, nil
}

func (f *nonLiveMemosFence) writeRefreshTokens(ctx context.Context, tx *sql.Tx, userID int32, tokens *storepb.RefreshTokensUserSetting) error {
	raw, err := (protojson.MarshalOptions{}).Marshal(tokens)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO user_setting(user_id,key,value) VALUES(?,'REFRESH_TOKENS',?)
 ON CONFLICT(user_id,key) DO UPDATE SET value=EXCLUDED.value`, userID, string(raw))
	return err
}

// addSession is a fixture writer, NOT authentication or production sign-in.
// Read-modify-write and invalidation share the DB boundary; no Store cache is read.
func (f *nonLiveMemosFence) addSession(ctx context.Context, userID int32, input *storepb.RefreshTokensUserSetting_RefreshToken) error {
	if input == nil {
		return errNonLiveRejected
	}
	token := proto.Clone(input).(*storepb.RefreshTokensUserSetting_RefreshToken)
	if token.TokenId == "" || token.ExpiresAt == nil || !token.ExpiresAt.IsValid() || !token.ExpiresAt.AsTime().After(f.now()) {
		return errNonLiveRejected
	}
	tx, err := f.db.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	if err := tx.QueryRowContext(ctx, "SELECT row_status FROM user WHERE id=?", userID).Scan(&status); err != nil {
		return err
	}
	if status != "NORMAL" {
		return errNonLiveRejected
	}
	var blocked int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM asp_nonlive_withdrawal
 WHERE user_id=? AND (state='frozen' OR session_id=?)`, userID, token.TokenId).Scan(&blocked); err != nil {
		return err
	}
	if blocked != 0 {
		return errNonLiveRejected
	}
	tokens, err := f.refreshTokens(ctx, tx, userID)
	if err != nil {
		return err
	}
	kept := &storepb.RefreshTokensUserSetting{}
	for _, existing := range tokens.RefreshTokens {
		if existing.TokenId == token.TokenId || existing.ExpiresAt == nil || !existing.ExpiresAt.IsValid() {
			return errNonLiveRejected
		}
		if existing.ExpiresAt.AsTime().After(f.now()) {
			kept.RefreshTokens = append(kept.RefreshTokens, existing)
		}
	}
	kept.RefreshTokens = append(kept.RefreshTokens, token)
	if err := f.writeRefreshTokens(ctx, tx, userID, kept); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return errNonLiveUncertain
	}
	return nil
}

// sessionWithdrawn distinguishes positive absence/expiry evidence from SQL or
// parsing failure. Account archive/deletion alone is NOT session-removal proof.
func (f *nonLiveMemosFence) sessionWithdrawn(ctx context.Context, tx *sql.Tx, userID int32, tokenID string) error {
	var raw string
	err := tx.QueryRowContext(ctx, `SELECT value FROM user_setting
 WHERE user_id=? AND key='REFRESH_TOKENS'`, userID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	tokens := &storepb.RefreshTokensUserSetting{}
	// Unknown fields must not turn unsupported evidence into apparent absence.
	if err := (protojson.UnmarshalOptions{}).Unmarshal([]byte(raw), tokens); err != nil {
		return err
	}
	for _, token := range tokens.RefreshTokens {
		if token.TokenId != tokenID {
			continue
		}
		if token.ExpiresAt == nil || !token.ExpiresAt.IsValid() || token.ExpiresAt.AsTime().After(f.now()) {
			return errNonLiveRejected
		}
	}
	return nil
}

func (f *nonLiveMemosFence) reconcileWithdrawal(ctx context.Context, ref *nonLiveMemosWithdrawal) error {
	tx, err := f.db.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	userID, tokenID, err := f.withdrawal(ctx, tx, ref)
	if err != nil {
		return err
	}
	if err := f.sessionWithdrawn(ctx, tx, userID, tokenID); err != nil {
		return err
	}
	// Only symbolic records for this exact withdrawn session become terminal.
	// Other sessions' unresolved records still block fresh retention/attempts.
	if _, err := tx.ExecContext(ctx, `UPDATE asp_nonlive_candidate SET state='closed'
 WHERE user_id=? AND session_id=?`, userID, tokenID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE asp_nonlive_withdrawal SET state='reconciled' WHERE id=?", ref.id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return errNonLiveUncertain
	}
	return nil
}
