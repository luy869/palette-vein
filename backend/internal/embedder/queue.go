package embedder

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"

	"palettevein/internal/clip"
)

// 画像CDN(th./w.wallhaven.cc)からのDL間隔のデフォルト。
// 45 req/min は API(api/v1) の制限で画像ファイルのDLには本来かからないため控えめに短縮。
// EMBED_DELAY_MS で上書き可能。
const defaultEmbedDelay = 300 * time.Millisecond

type Queue struct {
	db    *pgxpool.Pool
	clip  *clip.Client
	in    chan int64
	delay time.Duration
}

func New(db *pgxpool.Pool, c *clip.Client, delay time.Duration) *Queue {
	if delay <= 0 {
		delay = defaultEmbedDelay
	}
	return &Queue{
		db:    db,
		clip:  c,
		in:    make(chan int64, 4096),
		delay: delay,
	}
}

func (q *Queue) Len() int { return len(q.in) }

// Enqueue は非ブロッキング。バッファ満杯なら drop（次回 /api/images で再試行）。
func (q *Queue) Enqueue(id int64) {
	select {
	case q.in <- id:
	default:
		slog.Info("embedder: queue full, dropping (catchup will retry)", "image_id", id)
	}
}

const maxEmbedErrors = 3

// Catchup は embedding が未生成の画像を全て Enqueue する。
func (q *Queue) Catchup(ctx context.Context) error {
	rows, err := q.db.Query(ctx,
		`SELECT id FROM images WHERE embedding IS NULL AND embed_errors < $1 ORDER BY id`, maxEmbedErrors)
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
		slog.Info("embedder: catchup enqueued images", "count", n)
	}
	return rows.Err()
}

// RunCatchup は定期的に Catchup を呼び、未埋め込み画像を継続的に処理する。
// チャンネルバッファ(256)より多い未処理画像があっても確実に追いつく。
func (q *Queue) RunCatchup(ctx context.Context) {
	const interval = 5 * time.Minute
	for {
		if err := q.Catchup(ctx); err != nil {
			slog.Error("embedder: catchup error", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(interval):
		}
	}
}

// Run はワーカーループ。ctx がキャンセルされると停止する。
func (q *Queue) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case id := <-q.in:
			q.process(ctx, id)
		}
	}
}

func (q *Queue) process(ctx context.Context, id int64) {
	var thumbURL string
	err := q.db.QueryRow(ctx,
		`SELECT thumb_url FROM images WHERE id=$1 AND embedding IS NULL AND embed_errors < $2`, id, maxEmbedErrors,
	).Scan(&thumbURL)
	if err != nil {
		return // not found, already embedded, or too many errors
	}

	// 画像CDNからダウンロードするので、ここで間隔を空ける
	select {
	case <-ctx.Done():
		return
	case <-time.After(q.delay):
	}

	// サムネ(約700px)を埋め込みに使う。CLIPは入力を224pxに縮小するため品質はフル画像と同等で、
	// DLが数MB→数百KBに軽くなる（埋め込みのボトルネックはDLだった）
	vec, err := q.clip.Embed(ctx, thumbURL)
	if err != nil {
		slog.Error("embedder: clip error", "image_id", id, "error", err)
		if _, uerr := q.db.Exec(ctx, `UPDATE images SET embed_errors = embed_errors + 1 WHERE id=$1`, id); uerr != nil {
			slog.Error("embedder: failed to bump embed_errors", "image_id", id, "error", uerr)
		}
		return
	}

	_, err = q.db.Exec(ctx,
		`UPDATE images SET embedding=$1 WHERE id=$2`,
		pgvector.NewVector(vec), id,
	)
	if err != nil {
		slog.Error("embedder: db error", "image_id", id, "error", err)
		return
	}
	slog.Info("embedder: embedded", "image_id", id, "dim", len(vec))
}
