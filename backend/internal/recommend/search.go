package recommend

import (
	"context"
	"math/rand"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
	pgvec "github.com/pgvector/pgvector-go"

	"palettevein/internal/models"
)

const (
	topKCandidates = 40
	finalLimit     = 24
	exploreCount   = 5
	similarCount   = finalLimit - exploreCount
)

// Result は推薦結果1件。
type Result struct {
	Image          models.Image `json:"image"`
	Score          float32      `json:"score"`
	Source         string       `json:"source"`
	ReasonImageIDs []int64      `json:"reason_image_ids"`
	embedding      []float32
}

// Response は /api/recommend のレスポンス。
type Response struct {
	Mode               string         `json:"mode"`
	Items              []Result       `json:"items"`
	ReasonImagesLookup []models.Image `json:"reason_images_lookup"`
}

func Search(ctx context.Context, db *pgxpool.Pool, userID int64, profile *UserProfile) (*Response, error) {
	candidates, err := querySimilar(ctx, db, userID, profile.Vector)
	if err != nil {
		return nil, err
	}

	explores, err := queryExplore(ctx, db, userID, exploreCount)
	if err != nil {
		return nil, err
	}

	n := similarCount
	if n > len(candidates) {
		n = len(candidates)
	}
	items := make([]Result, 0, finalLimit)
	for _, c := range candidates[:n] {
		items = append(items, c)
	}

	// explore 不足分を similar 末尾で補完
	if len(explores) < exploreCount && len(candidates) > n {
		extra := exploreCount - len(explores)
		end := n + extra
		if end > len(candidates) {
			end = len(candidates)
		}
		for _, c := range candidates[n:end] {
			c.Source = "explore"
			items = append(items, c)
		}
	}
	for _, e := range explores {
		items = append(items, e)
	}

	rand.Shuffle(len(items), func(i, j int) { items[i], items[j] = items[j], items[i] })

	// いいね画像ベクトルをロード（推薦理由計算用）
	likeVecs, likeImages, err := loadLikeVecs(ctx, db, profile.LikeImageIDs)
	if err != nil {
		return nil, err
	}

	// 推薦理由(b): 各 similar 推薦について top-2 近傍いいね画像を算出
	for i := range items {
		if items[i].Source != "similar" || len(items[i].embedding) == 0 {
			continue
		}
		items[i].ReasonImageIDs = topNReasons(items[i].embedding, likeVecs, 2)
	}

	// reason_images_lookup を構築
	lookup := make([]models.Image, 0)
	seen := map[int64]bool{}
	for _, item := range items {
		for _, rid := range item.ReasonImageIDs {
			if !seen[rid] {
				if img, ok := likeImages[rid]; ok {
					lookup = append(lookup, img)
					seen[rid] = true
				}
			}
		}
	}

	return &Response{
		Mode:               "similar",
		Items:              items,
		ReasonImagesLookup: lookup,
	}, nil
}

func querySimilar(ctx context.Context, db *pgxpool.Pool, userID int64, vec []float32) ([]Result, error) {
	v := pgvec.NewVector(vec)
	rows, err := db.Query(ctx, `
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at, colors,
		       1 - (embedding <=> $1) AS score,
		       embedding
		FROM images
		WHERE embedding IS NOT NULL
		  AND width > height
		  AND id NOT IN (SELECT image_id FROM feedback_events WHERE user_id = $2)
		ORDER BY embedding <=> $1
		LIMIT $3
	`, v, userID, topKCandidates)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []Result
	for rows.Next() {
		var r Result
		r.Source = "similar"
		var emb pgvec.Vector
		if err := rows.Scan(
			&r.Image.ID, &r.Image.WallhavenID, &r.Image.URL, &r.Image.ThumbURL,
			&r.Image.Width, &r.Image.Height, &r.Image.Ratio,
			&r.Image.Views, &r.Image.Favorites, &r.Image.FetchedAt, &r.Image.Colors,
			&r.Score, &emb,
		); err != nil {
			return nil, err
		}
		r.embedding = emb.Slice()
		results = append(results, r)
	}
	return results, rows.Err()
}

func queryExplore(ctx context.Context, db *pgxpool.Pool, userID int64, n int) ([]Result, error) {
	rows, err := db.Query(ctx, `
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at, colors
		FROM images
		WHERE embedding IS NOT NULL
		  AND width > height
		  AND id NOT IN (SELECT image_id FROM feedback_events WHERE user_id = $1)
		ORDER BY (views + favorites * 3) DESC, RANDOM()
		LIMIT $2
	`, userID, n*3)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var candidates []Result
	for rows.Next() {
		var r Result
		r.Source = "explore"
		if err := rows.Scan(
			&r.Image.ID, &r.Image.WallhavenID, &r.Image.URL, &r.Image.ThumbURL,
			&r.Image.Width, &r.Image.Height, &r.Image.Ratio,
			&r.Image.Views, &r.Image.Favorites, &r.Image.FetchedAt, &r.Image.Colors,
		); err != nil {
			return nil, err
		}
		candidates = append(candidates, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	rand.Shuffle(len(candidates), func(i, j int) { candidates[i], candidates[j] = candidates[j], candidates[i] })
	if len(candidates) > n {
		candidates = candidates[:n]
	}
	return candidates, nil
}

func loadLikeVecs(ctx context.Context, db *pgxpool.Pool, ids []int64) (map[int64][]float32, map[int64]models.Image, error) {
	if len(ids) == 0 {
		return nil, nil, nil
	}
	rows, err := db.Query(ctx, `
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at, colors, embedding
		FROM images
		WHERE id = ANY($1) AND embedding IS NOT NULL
	`, ids)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	vecs := map[int64][]float32{}
	imgs := map[int64]models.Image{}
	for rows.Next() {
		var img models.Image
		var vec pgvec.Vector
		if err := rows.Scan(
			&img.ID, &img.WallhavenID, &img.URL, &img.ThumbURL,
			&img.Width, &img.Height, &img.Ratio,
			&img.Views, &img.Favorites, &img.FetchedAt, &img.Colors,
			&vec,
		); err != nil {
			return nil, nil, err
		}
		vecs[img.ID] = vec.Slice()
		imgs[img.ID] = img
	}
	return vecs, imgs, rows.Err()
}

func topNReasons(recVec []float32, likeVecs map[int64][]float32, n int) []int64 {
	type scored struct {
		id    int64
		score float32
	}
	ss := make([]scored, 0, len(likeVecs))
	for id, lv := range likeVecs {
		ss = append(ss, scored{id: id, score: cosineSim(recVec, lv)})
	}
	sort.Slice(ss, func(i, j int) bool { return ss[i].score > ss[j].score })
	if len(ss) > n {
		ss = ss[:n]
	}
	ids := make([]int64, len(ss))
	for i, s := range ss {
		ids[i] = s.id
	}
	return ids
}

func SearchToplist(ctx context.Context, db *pgxpool.Pool, userID int64) (*Response, error) {
	items, err := queryToplist(ctx, db, userID, finalLimit)
	if err != nil {
		return nil, err
	}
	return &Response{
		Mode:               "toplist",
		Items:              items,
		ReasonImagesLookup: make([]models.Image, 0),
	}, nil
}

func queryToplist(ctx context.Context, db *pgxpool.Pool, userID int64, n int) ([]Result, error) {
	rows, err := db.Query(ctx, `
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at, colors
		FROM images
		WHERE width > height
		  AND id NOT IN (SELECT image_id FROM feedback_events WHERE user_id = $1)
		ORDER BY (views + favorites * 3) DESC
		LIMIT $2
	`, userID, n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []Result
	for rows.Next() {
		var r Result
		r.Source = "explore"
		if err := rows.Scan(
			&r.Image.ID, &r.Image.WallhavenID, &r.Image.URL, &r.Image.ThumbURL,
			&r.Image.Width, &r.Image.Height, &r.Image.Ratio,
			&r.Image.Views, &r.Image.Favorites, &r.Image.FetchedAt, &r.Image.Colors,
		); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

func cosineSim(a, b []float32) float32 {
	var dot float32
	for i := range a {
		if i >= len(b) {
			break
		}
		dot += a[i] * b[i]
	}
	return dot // 両ベクトルは L2 正規化済み
}
