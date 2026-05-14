package coalesce

import (
	"container/list"
	"time"
)

// lru is a fixed-capacity, time-aware LRU. It's intentionally simple:
// container/list backs the recency order, a map indexes by key. Both
// inserts and Get are O(1).
//
// TTL handling is lazy: Get checks expiresAt and reports a miss for
// expired entries, removing them from the structure as a side effect.
// We don't run a sweeper goroutine — under the bench workload the hot
// keys get refreshed faster than TTL anyway, and on idle nobody cares
// if a few stale entries linger until the next Get touches them.
//
// Not safe for concurrent use. Callers (in this package, the Cache
// type) hold a mutex around it.
type lru struct {
	cap   int
	ll    *list.List
	index map[string]*list.Element
}

type lruEntry struct {
	key       string
	value     []byte
	expiresAt time.Time
}

func newLRU(cap int) *lru {
	if cap <= 0 {
		cap = 1
	}
	return &lru{
		cap:   cap,
		ll:    list.New(),
		index: make(map[string]*list.Element, cap),
	}
}

// Get returns the cached value if present and not yet expired. Bumps
// the entry to MRU position on hit. Removes expired entries as a side
// effect (lazy TTL eviction).
func (l *lru) Get(key string, now time.Time) ([]byte, bool) {
	el, ok := l.index[key]
	if !ok {
		return nil, false
	}
	entry := el.Value.(*lruEntry)
	if !entry.expiresAt.After(now) {
		// Expired — remove and report miss.
		l.ll.Remove(el)
		delete(l.index, key)
		return nil, false
	}
	l.ll.MoveToFront(el)
	return entry.value, true
}

// Set inserts or updates a key. Bumps to MRU. On overflow, evicts the
// LRU entry. A re-Set of an existing key is an update — does NOT
// consume a fresh capacity slot.
func (l *lru) Set(key string, value []byte, expiresAt time.Time) {
	if el, ok := l.index[key]; ok {
		entry := el.Value.(*lruEntry)
		entry.value = value
		entry.expiresAt = expiresAt
		l.ll.MoveToFront(el)
		return
	}
	entry := &lruEntry{key: key, value: value, expiresAt: expiresAt}
	el := l.ll.PushFront(entry)
	l.index[key] = el

	if l.ll.Len() > l.cap {
		oldest := l.ll.Back()
		if oldest != nil {
			ev := oldest.Value.(*lruEntry)
			delete(l.index, ev.key)
			l.ll.Remove(oldest)
		}
	}
}

// Len returns the current number of entries (live + expired-but-not-yet-
// swept). Used by tests; not part of the public Cache surface.
func (l *lru) Len() int { return l.ll.Len() }
