package identity

import (
	"errors"
	"sort"
	"sync"
)

// ErrNotFound is returned by Store.Get when the id is unknown.
var ErrNotFound = errors.New("identity: not found")

// Store persists issued identities. v0.0.1 ships an in-memory implementation;
// SQLite-backed Store ships in v0.0.2.
type Store interface {
	Save(id Identity) error
	Get(id string) (Identity, error)
	List() ([]Identity, error)
}

// MemStore is an in-memory Store, safe for concurrent use.
type MemStore struct {
	mu    sync.RWMutex
	items map[string]Identity
}

// NewMemStore returns an empty MemStore.
func NewMemStore() *MemStore {
	return &MemStore{items: make(map[string]Identity)}
}

func (m *MemStore) Save(id Identity) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.items[id.ID] = id
	return nil
}

func (m *MemStore) Get(id string) (Identity, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.items[id]
	if !ok {
		return Identity{}, ErrNotFound
	}
	return v, nil
}

func (m *MemStore) List() ([]Identity, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Identity, 0, len(m.items))
	for _, v := range m.items {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].IssuedAt.After(out[j].IssuedAt)
	})
	return out, nil
}
