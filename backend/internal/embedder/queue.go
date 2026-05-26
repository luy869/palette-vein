package embedder

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"

	"palettevein/internal/clip"
)

// Wallhaven レート制限: 45 req/min → 1枚あたり最低1.4秒
const rateLimitDelay = 1400 * time.Millisecond

type Queue struct {
	db   *pgxpool.Pool
	clip *clip.Client
	in   chan int64
}

func New(db *pgxpool.Pool, c *clip.Client) *Queue {
	return &Queue{
		db:   db,
		clip: c,
		in:   make(chan int64, 256),
	}
}

func (q *Queue) Len() int { return len(q.in) }

// Enqueue は非ブロッキング。バッファ満杯なら drop（次回 /api/images で再試行）。
func (q *Queue) Enqueue(id int64) {
	select {
	case q.in <- id:
	default:
	}
}

// Catchup は起動時に embedding が未生成の画像を全て Enqueue する。
func (q *Queue) Catchup(ctx context.Context) error {
	rows, err := q.db.Query(ctx,
		`SELECT id FROM images WHERE embedding IS NULL ORDER BY id`)
	if err != nil {
		return err
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			continue
		}
		q.Enqueue(id)
		n++
	}
	if n > 0 {
		log.Printf("embedder: catchup enqueued %d images", n)
	}
	return rows.Err()
}

// Run はワーカーループ。ctx がキャンセルされると停止する。
func (q *Queue) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case id := <-q.in:
			q.process(ctx, id)
			// レート制限: 次のURLダウンロードまで待機
			select {
			case <-ctx.Done():
				return
			case <-time.After(rateLimitDelay):
			}
		}
	}
}

func (q *Queue) process(ctx context.Context, id int64) {
	// 既に生成済みなら skip
	var url string
	err := q.db.QueryRow(ctx,
		`SELECT url FROM images WHERE id=$1 AND embedding IS NULL`, id,
	).Scan(&url)
	if err != nil {
		return // not found or already embedded
	}

	vec, err := q.clip.Embed(ctx, url)
	if err != nil {
		log.Printf("embedder: clip error image_id=%d: %v", id, err)
		return
	}

	_, err = q.db.Exec(ctx,
		`UPDATE images SET embedding=$1 WHERE id=$2`,
		pgvector.NewVector(vec), id,
	)
	if err != nil {
		log.Printf("embedder: db error image_id=%d: %v", id, err)
		return
	}
	log.Printf("embedder: embedded image_id=%d dim=%d", id, len(vec))
}
