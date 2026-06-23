package recommend

import (
	"context"
	"math/rand"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
	pgvec "github.com/pgvector/pgvector-go"

	"palettevein/internal/concepts"
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
	Image          models.Image   `json:"image"`
	Score          float32        `json:"score"`
	Source         string         `json:"source"`
	ReasonImageIDs []int64        `json:"reason_image_ids"`
	ReasonTags     []concepts.Tag `json:"reason_tags"`
	embedding      []float32
}

// Response は /api/recommend のレスポンス。
type Response struct {
	Mode               string         `json:"mode"`
	Items              []Result       `json:"items"`
	ReasonImagesLookup []models.Image `json:"reason_images_lookup"`
}

func Search(ctx context.Context, db *pgxpool.Pool, userID int64, profile *UserProfile, excludeIDs []int64, tagger *concepts.Tagger) (*Response, error) {
	// クラスタ（好みの系統）ごとに類似検索し、いいねシェアに比例して枠を配分する
	clusters := profile.Clusters
	if len(clusters) == 0 {
		clusters = []ProfileCluster{{Vector: profile.Vector, Share: 1.0}}
	}
	perCluster := make([][]Result, len(clusters))
	shares := make([]float64, len(clusters))
	for i, cl := range clusters {
		cands, err := querySimilar(ctx, db, userID, cl.Vector, excludeIDs)
		if err != nil {
			return nil, err
		}
		perCluster[i] = cands
		shares[i] = cl.Share
	}
	candidates := mergeClusterCandidates(perCluster, allocateCounts(shares, similarCount), similarCount)

	explores, err := queryExplore(ctx, db, userID, exploreCount, excludeIDs)
	if err != nil {
		return nil, err
	}

	items := make([]Result, 0, finalLimit)
	items = append(items, candidates...)

	// explore 不足分は similar 候補の余りで補完
	if len(explores) < exploreCount {
		extra := exploreCount - len(explores)
		leftovers := leftoverCandidates(perCluster, items, extra)
		for _, c := range leftovers {
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
	// usedCounts で使用済み画像にペナルティを与え、同じ画像が偏らないよう分散
	usedCounts := map[int64]int{}
	for i := range items {
		if items[i].Source != "similar" || len(items[i].embedding) == 0 {
			continue
		}
		ids := topNReasons(items[i].embedding, likeVecs, 2, usedCounts)
		items[i].ReasonImageIDs = ids
		for _, id := range ids {
			usedCounts[id]++
		}
		// 推薦理由(a): 画像とプロフィール両方に合致する概念タグ（CLIP テキスト類似）
		if tagger != nil {
			tags := tagger.Reason(items[i].embedding, profile.Vector, 3)
			if tags != nil {
				items[i].ReasonTags = tags
			}
		}
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

// mergeClusterCandidates は各クラスタの候補から配分数ずつ取り、画像ID重複を除いてマージする。
// いずれかのクラスタで候補が不足した場合は他クラスタの余りをスコア順で補填する。
func mergeClusterCandidates(perCluster [][]Result, allocs []int, total int) []Result {
	seen := map[int64]bool{}
	out := make([]Result, 0, total)

	for i, cands := range perCluster {
		taken := 0
		for _, c := range cands {
			if taken >= allocs[i] || len(out) >= total {
				break
			}
			if seen[c.Image.ID] {
				continue
			}
			seen[c.Image.ID] = true
			out = append(out, c)
			taken++
		}
	}

	// 不足分を全クラスタの余りからスコア順で補填
	if len(out) < total {
		var rest []Result
		for _, cands := range perCluster {
			for _, c := range cands {
				if !seen[c.Image.ID] {
					rest = append(rest, c)
				}
			}
		}
		sort.Slice(rest, func(i, j int) bool { return rest[i].Score > rest[j].Score })
		for _, c := range rest {
			if len(out) >= total {
				break
			}
			if seen[c.Image.ID] {
				continue
			}
			seen[c.Image.ID] = true
			out = append(out, c)
		}
	}
	return out
}

// leftoverCandidates は items に含まれない候補をスコア順に最大 n 件返す。
func leftoverCandidates(perCluster [][]Result, items []Result, n int) []Result {
	used := map[int64]bool{}
	for _, it := range items {
		used[it.Image.ID] = true
	}
	var rest []Result
	for _, cands := range perCluster {
		for _, c := range cands {
			if !used[c.Image.ID] {
				used[c.Image.ID] = true
				rest = append(rest, c)
			}
		}
	}
	sort.Slice(rest, func(i, j int) bool { return rest[i].Score > rest[j].Score })
	if len(rest) > n {
		rest = rest[:n]
	}
	return rest
}

func querySimilar(ctx context.Context, db *pgxpool.Pool, userID int64, vec []float32, excludeIDs []int64) ([]Result, error) {
	v := pgvec.NewVector(vec)
	rows, err := db.Query(ctx, `
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at, colors,
		       1 - (embedding <=> $1) AS score,
		       embedding
		FROM images
		WHERE embedding IS NOT NULL
		  AND width > height
		  AND id NOT IN (SELECT image_id FROM feedback_events WHERE user_id = $2)
		  AND (cardinality($4::bigint[]) = 0 OR id != ALL($4::bigint[]))
		ORDER BY embedding <=> $1
		LIMIT $3
	`, v, userID, topKCandidates, excludeIDs)
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

func queryExplore(ctx context.Context, db *pgxpool.Pool, userID int64, n int, excludeIDs []int64) ([]Result, error) {
	rows, err := db.Query(ctx, `
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at, colors
		FROM images
		WHERE embedding IS NOT NULL
		  AND width > height
		  AND id NOT IN (SELECT image_id FROM feedback_events WHERE user_id = $1)
		  AND (cardinality($3::bigint[]) = 0 OR id != ALL($3::bigint[]))
		ORDER BY (views + favorites * 3) DESC, RANDOM()
		LIMIT $2
	`, userID, n*3, excludeIDs)
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

func topNReasons(recVec []float32, likeVecs map[int64][]float32, n int, usedCounts map[int64]int) []int64 {
	type scored struct {
		id    int64
		score float32
	}
	ss := make([]scored, 0, len(likeVecs))
	for id, lv := range likeVecs {
		sim := cosineSim(recVec, lv)
		// 使用回数が多いほどスコアを下げて分散
		penalty := float32(1 + usedCounts[id])
		ss = append(ss, scored{id: id, score: sim / penalty})
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

func SearchToplist(ctx context.Context, db *pgxpool.Pool, userID int64, excludeIDs []int64) (*Response, error) {
	items, err := queryToplist(ctx, db, userID, finalLimit, excludeIDs)
	if err != nil {
		return nil, err
	}
	return &Response{
		Mode:               "toplist",
		Items:              items,
		ReasonImagesLookup: make([]models.Image, 0),
	}, nil
}

func queryToplist(ctx context.Context, db *pgxpool.Pool, userID int64, n int, excludeIDs []int64) ([]Result, error) {
	rows, err := db.Query(ctx, `
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at, colors
		FROM images
		WHERE width > height
		  AND id NOT IN (SELECT image_id FROM feedback_events WHERE user_id = $1)
		  AND (cardinality($3::bigint[]) = 0 OR id != ALL($3::bigint[]))
		ORDER BY (views + favorites * 3) DESC
		LIMIT $2
	`, userID, n, excludeIDs)
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
