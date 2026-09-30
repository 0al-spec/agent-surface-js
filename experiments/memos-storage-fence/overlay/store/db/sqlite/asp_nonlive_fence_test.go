//go:build asp_nonlive_fence

package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/usememos/memos/internal/profile"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

type nonLiveMemosFixture struct {
	db      *DB
	store   *store.Store
	fence   *nonLiveMemosFence
	userID  int32
	profile *profile.Profile
	now     time.Time
}

func newNonLiveMemosFixture(t *testing.T) *nonLiveMemosFixture {
	t.Helper()
	p := &profile.Profile{DSN: filepath.Join(t.TempDir(), "memos.sqlite"), Driver: "sqlite", Version: "0.31.0"}
	driver, err := NewDB(p)
	if err != nil {
		t.Fatal(err)
	}
	db := driver.(*DB)
	s := store.New(driver, p)
	t.Cleanup(func() { s.Close() })
	if err := s.Migrate(t.Context()); err != nil {
		t.Fatal(err)
	}
	user, err := s.CreateUser(t.Context(), &store.User{Username: "nonlive", Role: store.RoleUser, RowStatus: store.Normal, PasswordHash: "fixture-not-an-authenticated-account"})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := s.AddUserRefreshToken(t.Context(), user.ID, &storepb.RefreshTokensUserSetting_RefreshToken{TokenId: "fixture-session", ExpiresAt: timestamppb.New(now.Add(time.Hour))}); err != nil {
		t.Fatal(err)
	}
	fence, err := installNonLiveMemosFence(t.Context(), db, func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	return &nonLiveMemosFixture{db: db, store: s, fence: fence, userID: user.ID, profile: p, now: now}
}

func (f *nonLiveMemosFixture) candidate(t *testing.T) *nonLiveMemosCandidate {
	t.Helper()
	ref, err := f.fence.retain(t.Context(), f.userID, "fixture-session")
	if err != nil {
		t.Fatal(err)
	}
	return ref
}
func (f *nonLiveMemosFixture) count(t *testing.T, want int) {
	t.Helper()
	var count int
	if err := f.db.db.QueryRow("SELECT COUNT(*) FROM asp_nonlive_publication").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != want {
		t.Fatalf("publication count %d, want %d", count, want)
	}
}
func (f *nonLiveMemosFixture) state(t *testing.T, ref *nonLiveMemosCandidate, want string) {
	t.Helper()
	var state string
	if err := f.db.db.QueryRow("SELECT state FROM asp_nonlive_candidate WHERE id=?", ref.id).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != want {
		t.Fatalf("state %s, want %s", state, want)
	}
}

func TestNonLiveMemosFenceStorageInvalidation(t *testing.T) {
	for _, kind := range []string{"logout", "password", "archive", "role", "rotation-add", "generic-delete", "user-delete"} {
		t.Run(kind, func(t *testing.T) {
			f := newNonLiveMemosFixture(t)
			ref := f.candidate(t)
			var err error
			switch kind {
			case "logout":
				err = f.store.RemoveUserRefreshToken(t.Context(), f.userID, "fixture-session")
			case "password":
				hash := "changed-fixture"
				_, err = f.store.UpdateUser(t.Context(), &store.UpdateUser{ID: f.userID, PasswordHash: &hash})
			case "archive":
				state := store.Archived
				_, err = f.store.UpdateUser(t.Context(), &store.UpdateUser{ID: f.userID, RowStatus: &state})
			case "role":
				role := store.RoleAdmin
				_, err = f.store.UpdateUser(t.Context(), &store.UpdateUser{ID: f.userID, Role: &role})
			case "rotation-add":
				err = f.store.AddUserRefreshToken(t.Context(), f.userID, &storepb.RefreshTokensUserSetting_RefreshToken{TokenId: "replacement", ExpiresAt: timestamppb.New(f.now.Add(time.Hour))})
			case "generic-delete":
				err = f.store.DeleteUserSettings(t.Context(), &store.DeleteUserSetting{UserID: &f.userID, Key: storepb.UserSetting_REFRESH_TOKENS})
			case "user-delete":
				_, err = f.store.DeleteUser(t.Context(), &store.DeleteUser{ID: f.userID})
			}
			if err != nil {
				t.Fatal(err)
			}
			if err := f.fence.attempt(t.Context(), ref, nil); !errors.Is(err, errNonLiveRejected) {
				t.Fatal(err)
			}
			f.count(t, 0)
		})
	}
}

func TestNonLiveMemosFenceStaleActualStoreCache(t *testing.T) {
	f := newNonLiveMemosFixture(t)
	ref := f.candidate(t)
	// Warm a second Store's cache before another Store writes the same database.
	driver, err := NewDB(f.profile)
	if err != nil {
		t.Fatal(err)
	}
	cached := store.New(driver, f.profile)
	t.Cleanup(func() { cached.Close() })
	token, err := cached.GetUserRefreshTokenByID(t.Context(), f.userID, "fixture-session")
	if err != nil || token == nil {
		t.Fatal(err)
	}
	if err := f.store.RemoveUserRefreshToken(t.Context(), f.userID, "fixture-session"); err != nil {
		t.Fatal(err)
	}
	token, err = cached.GetUserRefreshTokenByID(t.Context(), f.userID, "fixture-session")
	if err != nil || token == nil {
		t.Fatal("fixture did not retain stale cached token", err)
	}
	if err := f.fence.attempt(t.Context(), ref, nil); !errors.Is(err, errNonLiveRejected) {
		t.Fatal(err)
	}
	f.count(t, 0)
}

func TestNonLiveMemosFenceCommitBeforeActualLogout(t *testing.T) {
	f := newNonLiveMemosFixture(t)
	ref := f.candidate(t)
	driver, err := NewDB(f.profile)
	if err != nil {
		t.Fatal(err)
	}
	writer := store.New(driver, f.profile)
	t.Cleanup(func() { writer.Close() })
	started := make(chan struct{})
	done := make(chan error, 1)
	err = f.fence.attempt(t.Context(), ref, func() error {
		go func() {
			close(started)
			done <- writer.RemoveUserRefreshToken(context.Background(), f.userID, "fixture-session")
		}()
		<-started
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("logout writer did not finish")
	}
	f.count(t, 1)
	f.state(t, ref, "revocation_required")
}

func TestNonLiveMemosFencePublicationRollback(t *testing.T) {
	f := newNonLiveMemosFixture(t)
	ref := f.candidate(t)
	if _, err := f.db.db.Exec("CREATE TRIGGER fail_symbolic BEFORE INSERT ON asp_nonlive_publication BEGIN SELECT RAISE(ABORT,'fixture failure'); END"); err != nil {
		t.Fatal(err)
	}
	if err := f.fence.attempt(t.Context(), ref, nil); err == nil {
		t.Fatal("write failure accepted")
	}
	f.count(t, 0)
	f.state(t, ref, "attempted")
	if err := f.fence.attempt(t.Context(), ref, nil); !errors.Is(err, errNonLiveRejected) {
		t.Fatal(err)
	}
}

func TestNonLiveMemosFenceActualWriterRollbackIsNotRevocation(t *testing.T) {
	f := newNonLiveMemosFixture(t)
	ref := f.candidate(t)
	if _, err := f.db.db.Exec("CREATE TRIGGER fail_revision BEFORE UPDATE ON asp_nonlive_revision BEGIN SELECT RAISE(ABORT,'fixture failure'); END"); err != nil {
		t.Fatal(err)
	}
	if err := f.store.RemoveUserRefreshToken(t.Context(), f.userID, "fixture-session"); err == nil {
		t.Fatal("failure hidden")
	}
	tokens, err := f.db.ListUserSettings(t.Context(), &store.FindUserSetting{UserID: &f.userID, Key: storepb.UserSetting_REFRESH_TOKENS})
	if err != nil || len(tokens) != 1 {
		t.Fatal(err)
	}
	// The ordinary database write and trigger rollback together; no confirmed revocation.
	if _, err := f.fence.currentSessionInFixture(t.Context(), f.userID); err != nil {
		t.Fatal(err)
	}
	f.state(t, ref, "pending")
	f.count(t, 0)
	// Full failed-logout host freeze/reconciliation is deliberately not claimed.
}

func (f *nonLiveMemosFence) currentSessionInFixture(ctx context.Context, userID int32) (int64, error) {
	tx, err := f.db.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	return f.currentSession(ctx, tx, userID, "fixture-session")
}

func TestNonLiveMemosFenceNotInstalledByDefault(t *testing.T) {
	p := &profile.Profile{DSN: filepath.Join(t.TempDir(), "ordinary.sqlite"), Driver: "sqlite", Version: "0.31.0"}
	driver, err := NewDB(p)
	if err != nil {
		t.Fatal(err)
	}
	s := store.New(driver, p)
	t.Cleanup(func() { s.Close() })
	if err := s.Migrate(t.Context()); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := driver.(*DB).db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'asp_nonlive_%'").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("non-live objects installed implicitly")
	}
}
