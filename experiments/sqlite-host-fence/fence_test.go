package hostfence

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

type fixture struct {
	db    *sql.DB
	fence *Fence
	path  string
	now   time.Time
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	f := &fixture{path: filepath.Join(t.TempDir(), "authority.sqlite"), now: time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC)}
	f.db = openFixtureDB(t, f.path)
	if _, err := f.db.Exec(schema); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`INSERT INTO account VALUES(1,1,1); INSERT INTO session VALUES('s1',1,1,1,?)`, f.now.Add(time.Minute).UnixNano()); err != nil {
		t.Fatal(err)
	}
	f.fence = NewFence(f.db, func() time.Time { return f.now })
	return f
}

func openFixtureDB(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_txlock=immediate")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func (f *fixture) candidate(t *testing.T) *Candidate {
	t.Helper()
	ref, err := f.fence.Retain(context.Background(), 1, "s1")
	if err != nil {
		t.Fatal(err)
	}
	return ref
}

func (f *fixture) publications(t *testing.T, want int) {
	t.Helper()
	var got int
	if err := f.db.QueryRow(`SELECT COUNT(*) FROM publication`).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("publications = %d, want %d", got, want)
	}
}

func (f *fixture) state(t *testing.T, ref *Candidate, want string) {
	t.Helper()
	var got string
	if err := f.db.QueryRow(`SELECT state FROM candidate WHERE id=?`, ref.id).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("state = %s, want %s", got, want)
	}
}

func TestOneSymbolicPublicationAndNoRetry(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	if err := f.fence.Attempt(t.Context(), ref); err != nil {
		t.Fatal(err)
	}
	if err := f.fence.Attempt(t.Context(), ref); !errors.Is(err, ErrRejected) {
		t.Fatal(err)
	}
	f.publications(t, 1)
	f.state(t, ref, "issued")
}

func TestMissingWrongAccountAndExpiredSession(t *testing.T) {
	f := newFixture(t)
	for _, args := range []struct {
		account int64
		session string
	}{{1, "missing"}, {2, "s1"}} {
		if _, err := f.fence.Retain(t.Context(), args.account, args.session); !errors.Is(err, ErrRejected) {
			t.Fatal(err)
		}
	}
	f.now = f.now.Add(time.Minute)
	if _, err := f.fence.Retain(t.Context(), 1, "s1"); !errors.Is(err, ErrRejected) {
		t.Fatal(err)
	}
	f.publications(t, 0)
}

func TestDatabaseWriteFailureRollsBackPublication(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	if _, err := f.db.Exec(`CREATE TRIGGER fail_publication BEFORE INSERT ON publication BEGIN SELECT RAISE(ABORT,'injected write failure'); END`); err != nil {
		t.Fatal(err)
	}
	if err := f.fence.Attempt(t.Context(), ref); err == nil {
		t.Fatal("database failure accepted")
	}
	f.publications(t, 0)
	f.state(t, ref, "attempted")
	if err := f.fence.Attempt(t.Context(), ref); !errors.Is(err, ErrRejected) {
		t.Fatal(err)
	}
}

func TestInvalidationBeforeIssuance(t *testing.T) {
	for _, kind := range []string{"logout", "archive", "password", "rotation"} {
		t.Run(kind, func(t *testing.T) {
			f := newFixture(t)
			ref := f.candidate(t)
			var err error
			switch kind {
			case "logout":
				err = f.fence.SessionWithdrawal(t.Context(), "s1")
			case "archive":
				err = f.fence.AccountChange(t.Context(), 1, false)
			case "password":
				err = f.fence.AccountChange(t.Context(), 1, true)
			case "rotation":
				err = f.fence.SessionRotation(t.Context(), "s1", "s2")
			}
			if err != nil {
				t.Fatal(err)
			}
			if err := f.fence.Attempt(t.Context(), ref); !errors.Is(err, ErrRejected) {
				t.Fatal(err)
			}
			f.publications(t, 0)
		})
	}
}

func TestTwoConnectionsIssuanceBeforeWithdrawal(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	other := NewFence(openFixtureDB(t, f.path), func() time.Time { return f.now })
	started := make(chan struct{})
	done := make(chan error, 1)
	err := f.fence.attempt(t.Context(), ref, func() error {
		go func() { close(started); done <- other.SessionWithdrawal(t.Context(), "s1") }()
		<-started
		return nil
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("writer did not finish")
	}
	f.publications(t, 1)
	f.state(t, ref, "revocation_required")
}

func TestTwoConnectionsWithdrawalBeforeIssuance(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	other := NewFence(openFixtureDB(t, f.path), func() time.Time { return f.now })
	started := make(chan struct{})
	done := make(chan error, 1)
	err := other.withdraw(t.Context(), "s1", func() error {
		go func() { close(started); done <- f.fence.Attempt(t.Context(), ref) }()
		<-started
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if !errors.Is(err, ErrRejected) {
			t.Fatal(err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("attempt did not finish")
	}
	f.publications(t, 0)
}

func TestDuplicateConcurrentAttempts(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	results := make(chan error, 12)
	var group sync.WaitGroup
	for i := 0; i < 12; i++ {
		group.Go(func() { results <- f.fence.Attempt(t.Context(), ref) })
	}
	group.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		} else if !errors.Is(err, ErrRejected) {
			t.Fatal(err)
		}
	}
	if success != 1 {
		t.Fatalf("successful attempts = %d", success)
	}
	f.publications(t, 1)
}

func TestRollbackKeepsAttemptConsumed(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	otherPending := f.candidate(t)
	failure := errors.New("injected transaction failure")
	if err := f.fence.attempt(t.Context(), ref, func() error { return failure }, nil); !errors.Is(err, failure) {
		t.Fatal(err)
	}
	f.publications(t, 0)
	f.state(t, ref, "attempted")
	if err := f.fence.Attempt(t.Context(), ref); !errors.Is(err, ErrRejected) {
		t.Fatal(err)
	}
	if err := f.fence.Attempt(t.Context(), otherPending); !errors.Is(err, ErrRejected) {
		t.Fatal("pending candidate bypassed failure", err)
	}
}

func TestLostCommitAcknowledgementCannotRetry(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	if err := f.fence.attempt(t.Context(), ref, nil, func() error { return errors.New("ack lost") }); !errors.Is(err, ErrUncertain) {
		t.Fatal(err)
	}
	f.publications(t, 1)
	if _, err := f.fence.Retain(t.Context(), 1, "s1"); !errors.Is(err, ErrRejected) {
		t.Fatal("fresh candidate bypassed unresolved state", err)
	}
	if err := f.fence.Attempt(t.Context(), ref); !errors.Is(err, ErrRejected) {
		t.Fatal(err)
	}
}

func TestStaleRetainedSnapshotDoesNotAuthorize(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	// A stale cached active fixture snapshot still exists, but commit reads the DB.
	if _, err := f.db.Exec(`UPDATE session SET active=0,revision=revision+1 WHERE id='s1'`); err != nil {
		t.Fatal(err)
	}
	if err := f.fence.Attempt(t.Context(), ref); !errors.Is(err, ErrRejected) {
		t.Fatal(err)
	}
	f.publications(t, 0)
}

func TestExpiryAtFinalPrecommitGuard(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	err := f.fence.attempt(t.Context(), ref, func() error { f.now = f.now.Add(time.Minute); return nil }, nil)
	if !errors.Is(err, ErrRejected) {
		t.Fatal(err)
	}
	f.publications(t, 0)
	f.state(t, ref, "attempted")
}

func TestForeignAndCopiedIDCannotAuthorize(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	other := NewFence(f.db, func() time.Time { return f.now })
	for _, candidate := range []*Candidate{nil, {id: ref.id}, ref} {
		if err := other.Attempt(t.Context(), candidate); !errors.Is(err, ErrRejected) {
			t.Fatal(err)
		}
	}
	f.publications(t, 0)
}

func TestRestartRetainsConsumedAttempt(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	if err := f.fence.attempt(t.Context(), ref, func() error { return errors.New("precommit failure") }, nil); err == nil {
		t.Fatal("expected failure")
	}
	if err := f.db.Close(); err != nil {
		t.Fatal(err)
	}
	f.db = openFixtureDB(t, f.path)
	reopened := NewFence(f.db, func() time.Time { return f.now })
	// Internal test reconstruction is NOT a public reference restoration API.
	if err := reopened.Attempt(t.Context(), &Candidate{owner: reopened, id: ref.id}); !errors.Is(err, ErrRejected) {
		t.Fatal(err)
	}
	f.publications(t, 0)
	f.state(t, ref, "attempted")
}

func TestUnavailableStoreAndWithdrawalRollback(t *testing.T) {
	f := newFixture(t)
	ref := f.candidate(t)
	failure := errors.New("write failure")
	if err := f.fence.withdraw(t.Context(), "s1", func() error { return failure }); !errors.Is(err, failure) {
		t.Fatal(err)
	}
	var active int
	if err := f.db.QueryRow(`SELECT active FROM session WHERE id='s1'`).Scan(&active); err != nil {
		t.Fatal(err)
	}
	if active != 1 {
		t.Fatal("withdrawal did not roll back")
	}
	f.publications(t, 0)
	if err := f.db.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.fence.Attempt(t.Context(), ref); err == nil {
		t.Fatal("closed store authorized")
	}
}
