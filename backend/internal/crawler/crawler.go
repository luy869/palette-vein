package crawler

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"palettevein/internal/embedder"
	"palettevein/internal/wallhaven"
)

const fetchDelay = 1500 * time.Millisecond
const maxImages = 50_000

var sortings = []string{"toplist", "views", "favorites", "random"}

const pagesPerSorting = 50

type Crawler struct {
	db      *pgxpool.Pool
	wh      *wallhaven.Client
	embedder *embedder.Queue
}

func New(db *pgxpool.Pool, wh *wallhaven.Client, eq *embedder.Queue) *Crawler {
	return &Crawler{db: db, wh: wh, embedder: eq}
}

const crawlInterval = 24 * time.Hour

// Run はバックグラウンドで定期クロールを繰り返す。
// 起動直後に1回実行し、以降は crawlInterval ごとに再実行する。
func (c *Crawler) Run(ctx context.Context) {
	for {
		c.runOnce(ctx)
		select {
		case <-ctx.Done():
			return
		case <-time.After(crawlInterval):
		}
	}
}

func (c *Crawler) prune(ctx context.Context) {
	var count int64
	if err := c.db.QueryRow(ctx, `SELECT COUNT(*) FROM images`).Scan(&count); err != nil || count <= maxImages {
		return
	}
	excess := count - maxImages
	tag, err := c.db.Exec(ctx, `
		DELETE FROM images
		WHERE id IN (
			SELECT id FROM images
			WHERE id NOT IN (SELECT DISTINCT image_id FROM feedback_events)
			ORDER BY fetched_at ASC
			LIMIT $1
		)
	`, excess)
	if err != nil {
		log.Printf("crawler: prune error: %v", err)
		return
	}
	log.Printf("crawler: pruned %d images (was %d, cap %d)", tag.RowsAffected(), count, maxImages)
}

func (c *Crawler) runOnce(ctx context.Context) {
	c.prune(ctx)
	log.Printf("crawler: start (%d sortings × up to %d pages)", len(sortings), pagesPerSorting)
	total := 0
	for _, sorting := range sortings {
		earlyStop := sorting != "random"
		for page := 1; page <= pagesPerSorting; page++ {
			if ctx.Err() != nil {
				log.Printf("crawler: cancelled after %d images", total)
				return
			}
			n, newCount, err := c.fetchPage(ctx, sorting, "", page)
			if err != nil {
				log.Printf("crawler: %s page %d: %v", sorting, page, err)
			} else {
				total += n
			}
			if earlyStop && newCount == 0 {
				log.Printf("crawler: %s page %d: no new images, stopping early", sorting, page)
				break
			}
			select {
			case <-ctx.Done():
				log.Printf("crawler: cancelled after %d images", total)
				return
			case <-time.After(fetchDelay):
			}
		}
	}
	log.Printf("crawler: done, upserted %d images", total)
}

func (c *Crawler) FetchQuery(ctx context.Context, query string, pages int) (int, error) {
	total := 0
	for page := 1; page <= pages; page++ {
		if ctx.Err() != nil {
			break
		}
		n, _, err := c.fetchPage(ctx, "relevance", query, page)
		if err != nil {
			return total, err
		}
		total += n
		if page < pages {
			select {
			case <-ctx.Done():
				return total, nil
			case <-time.After(fetchDelay):
			}
		}
	}
	return total, nil
}

// fetchPage は (upserted, newInserts, error) を返す。
func (c *Crawler) fetchPage(ctx context.Context, sorting, query string, page int) (int, int, error) {
	results, err := c.wh.Search(ctx, sorting, query, page)
	if err != nil {
		return 0, 0, err
	}
	total, newCount := 0, 0
	for _, res := range results {
		ratio := float64(res.DimensionX) / float64(res.DimensionY)
		var id int64
		var isNew bool
		err := c.db.QueryRow(ctx, `
			INSERT INTO images (wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, colors)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (wallhaven_id) DO UPDATE
				SET views      = EXCLUDED.views,
				    favorites  = EXCLUDED.favorites,
				    thumb_url  = EXCLUDED.thumb_url,
				    colors     = EXCLUDED.colors,
				    fetched_at = NOW()
			RETURNING id, (xmax = 0) AS is_new
		`, res.ID, res.Path, res.Thumbs.Large,
			res.DimensionX, res.DimensionY, ratio,
			res.Views, res.Favorites, res.Colors,
		).Scan(&id, &isNew)
		if err != nil {
			continue
		}
		c.embedder.Enqueue(id)
		total++
		if isNew {
			newCount++
		}
	}
	return total, newCount, nil
}
