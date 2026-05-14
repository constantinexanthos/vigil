package coalesce

import (
	"strconv"
	"testing"
	"time"
)

// LRU stores cached responses with a TTL. The bench bar (≥40% dedup on
// refactor's 8-email × ~90% identical query universe) doesn't need a
// fancy hot-set algorithm — it needs correctness on the basics:
//   - Get returns nil/false after TTL expires.
//   - Get bumps recency so frequently-accessed entries don't get evicted
//     under bounded capacity.
//   - Set evicts LRU on overflow.
//   - Per-entry size cap (256KB) — caller passes the cap; LRU enforces.

func TestLRUGetMissReturnsZero(t *testing.T) {
	l := newLRU(10)
	v, ok := l.Get("absent", time.Now())
	if ok {
		t.Errorf("expected miss; got %q", v)
	}
}

func TestLRUSetThenGetHits(t *testing.T) {
	l := newLRU(10)
	now := time.Now()
	l.Set("k", []byte("response"), now.Add(250*time.Millisecond))
	v, ok := l.Get("k", now)
	if !ok || string(v) != "response" {
		t.Errorf("hit: got (%q, %v), want (%q, true)", v, ok, "response")
	}
}

// TTL expiry is lazy on Get (cheaper than a sweeper goroutine). After
// `expiresAt`, the entry is reported as a miss and removed.
func TestLRUExpiredEntryIsMiss(t *testing.T) {
	l := newLRU(10)
	t0 := time.Now()
	l.Set("k", []byte("v"), t0.Add(250*time.Millisecond))

	// 100ms later: still hit.
	if _, ok := l.Get("k", t0.Add(100*time.Millisecond)); !ok {
		t.Errorf("100ms in: expected hit")
	}
	// 300ms later: expired → miss.
	if _, ok := l.Get("k", t0.Add(300*time.Millisecond)); ok {
		t.Errorf("300ms in: expected miss (expired)")
	}
}

// LRU eviction: fill exactly the bound, then add one more — the
// first-inserted entry is evicted. The 2nd-onwards survive.
func TestLRUEvictsLeastRecentlyUsedWhenBounded(t *testing.T) {
	l := newLRU(3)
	t0 := time.Now()
	exp := t0.Add(time.Hour) // long TTL so age isn't what's evicting

	l.Set("a", []byte("A"), exp)
	l.Set("b", []byte("B"), exp)
	l.Set("c", []byte("C"), exp)
	l.Set("d", []byte("D"), exp) // pushes "a" out

	if _, ok := l.Get("a", t0); ok {
		t.Errorf("expected 'a' evicted; still present")
	}
	for _, k := range []string{"b", "c", "d"} {
		if _, ok := l.Get(k, t0); !ok {
			t.Errorf("expected %q present after eviction of LRU", k)
		}
	}
}

// Get bumps recency. After Get on the oldest, a subsequent Set should
// evict the NEXT-oldest, not the just-touched one.
func TestLRUGetBumpsRecency(t *testing.T) {
	l := newLRU(3)
	t0 := time.Now()
	exp := t0.Add(time.Hour)

	l.Set("a", []byte("A"), exp)
	l.Set("b", []byte("B"), exp)
	l.Set("c", []byte("C"), exp)

	// Touch "a" — it should become MRU.
	if _, ok := l.Get("a", t0); !ok {
		t.Fatal("a should hit before bump test")
	}

	l.Set("d", []byte("D"), exp) // should evict "b" (now LRU), not "a"

	if _, ok := l.Get("a", t0); !ok {
		t.Errorf("a got evicted after recency bump; LRU bookkeeping wrong")
	}
	if _, ok := l.Get("b", t0); ok {
		t.Errorf("b should be evicted (now-LRU after a was bumped)")
	}
}

// A re-Set of the same key must NOT consume a fresh slot — it's an
// update of an existing entry. Without this guarantee, every refresh
// of the same hot key would slowly evict everything else.
func TestLRUReSetSameKeyDoesNotShrinkOthers(t *testing.T) {
	l := newLRU(3)
	t0 := time.Now()
	exp := t0.Add(time.Hour)

	l.Set("a", []byte("A1"), exp)
	l.Set("b", []byte("B"), exp)
	l.Set("c", []byte("C"), exp)
	l.Set("a", []byte("A2"), exp) // re-set, NOT a new slot

	for _, k := range []string{"a", "b", "c"} {
		if _, ok := l.Get(k, t0); !ok {
			t.Errorf("expected %q still present after re-set of a", k)
		}
	}
	if v, _ := l.Get("a", t0); string(v) != "A2" {
		t.Errorf("a not updated: got %q, want A2", v)
	}
}

// 1000-entry fill, 1001st evicts oldest — matches the spec's stated
// default and one of the 9 acceptance gates. The test does NOT Get
// any entry before the overflow insert (Get bumps recency, which is
// covered separately in TestLRUGetBumpsRecency).
func TestLRUDefaultBoundEvictsAt1001stEntry(t *testing.T) {
	l := newLRU(1000)
	t0 := time.Now()
	exp := t0.Add(time.Hour)

	for i := 0; i < 1000; i++ {
		l.Set(strconv.Itoa(i), []byte("v"), exp)
	}
	if l.Len() != 1000 {
		t.Fatalf("len after 1000 inserts = %d, want 1000", l.Len())
	}

	l.Set("1000", []byte("v"), exp) // evicts entry 0 (LRU)
	if _, ok := l.Get("0", t0); ok {
		t.Errorf("entry 0 should be evicted by 1001st insert")
	}
	if _, ok := l.Get("1000", t0); !ok {
		t.Errorf("entry 1000 should be present after insertion")
	}
}
