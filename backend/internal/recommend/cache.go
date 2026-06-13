package recommend

import (
	"context"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ProfileCache は好みベクトルのオンメモリTTLキャッシュ。
// フィードバック時に Invalidate されるため、TTL内でも鮮度は保たれる
// （TTLは時間減衰の更新が止まらないための保険）。
type ProfileCache struct {
	mu      sync.Mutex
	ttl     time.Duration
	entries map[int64]cacheEntry
}

type cacheEntry struct {
	profile *UserProfile // nil = フィードバック不足（コールドスタート）もキャッシュする
	at      time.Time
}

func NewProfileCache(ttl time.Duration) *ProfileCache {
	return &ProfileCache{ttl: ttl, entries: map[int64]cacheEntry{}}
}

// Get はキャッシュが新鮮ならそれを返し、なければ ComputeUserProfile して保存する。
func (c *ProfileCache) Get(ctx context.Context, db *pgxpool.Pool, userID int64) (*UserProfile, error) {
	c.mu.Lock()
	if e, ok := c.entries[userID]; ok && time.Since(e.at) < c.ttl {
		c.mu.Unlock()
		return e.profile, nil
	}
	c.mu.Unlock()

	profile, err := ComputeUserProfile(ctx, db, userID)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.entries[userID] = cacheEntry{profile: profile, at: time.Now()}
	c.mu.Unlock()
	return profile, nil
}

// Invalidate はフィードバックの追加/取り消し時に呼ぶ。
func (c *ProfileCache) Invalidate(userID int64) {
	c.mu.Lock()
	delete(c.entries, userID)
	c.mu.Unlock()
}
