package recommend

import (
	"context"
	"math"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
)

// UserProfile はユーザーの好みベクトルといいね画像IDを保持する。
// Clusters は好みの系統（複峰性対応）。いいねが少ないうちは1クラスタ。
type UserProfile struct {
	Vector       []float32 // 全いいねの加重平均（コールドスタート判定・後方互換用）
	Clusters     []ProfileCluster
	LikeImageIDs []int64
}

// ProfileCluster は好みの1系統。
type ProfileCluster struct {
	Vector  []float32
	Share   float64 // いいね重み合計に占める割合（推薦枠の配分に使う）
	LikeIDs []int64
}

type weightedVec struct {
	id  int64
	w   float64
	vec []float32
}

// ComputeUserProfile は過去90日のいいね/スキップから好みベクトルを算出する。
// 戻り値 (nil, nil) はフィードバックが不足していることを示す。
func ComputeUserProfile(ctx context.Context, db *pgxpool.Pool, userID int64) (*UserProfile, error) {
	// いいね（過去90日・embedding済みのみ）
	likeRows, err := db.Query(ctx, `
		SELECT fe.image_id,
		       EXTRACT(EPOCH FROM (NOW() - fe.created_at)) / 86400.0 AS age_days,
		       im.embedding
		FROM feedback_events fe
		JOIN images im ON im.id = fe.image_id
		WHERE fe.user_id = $1
		  AND fe.kind = 'like'
		  AND fe.created_at > NOW() - INTERVAL '90 days'
		  AND im.embedding IS NOT NULL
		ORDER BY fe.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer likeRows.Close()

	var likes []weightedVec
	for likeRows.Next() {
		var id int64
		var ageDays float64
		var vec pgvector.Vector
		if err := likeRows.Scan(&id, &ageDays, &vec); err != nil {
			continue
		}
		w := math.Exp(-ageDays / 14.0) // 半減期 ≈ 9.7日
		likes = append(likes, weightedVec{id: id, w: w, vec: vec.Slice()})
	}
	if err := likeRows.Err(); err != nil {
		return nil, err
	}

	if len(likes) == 0 {
		return nil, nil
	}

	// スキップ（過去90日・embedding済み）
	skipRows, err := db.Query(ctx, `
		SELECT im.embedding
		FROM feedback_events fe
		JOIN images im ON im.id = fe.image_id
		WHERE fe.user_id = $1
		  AND fe.kind = 'skip'
		  AND fe.created_at > NOW() - INTERVAL '90 days'
		  AND im.embedding IS NOT NULL
	`, userID)
	if err != nil {
		return nil, err
	}
	defer skipRows.Close()

	var skipVecs [][]float32
	for skipRows.Next() {
		var vec pgvector.Vector
		if err := skipRows.Scan(&vec); err != nil {
			continue
		}
		skipVecs = append(skipVecs, vec.Slice())
	}
	if err := skipRows.Err(); err != nil {
		return nil, err
	}

	profile := computeProfileVector(likes, skipVecs)
	if profile == nil {
		return nil, nil
	}

	likeIDs := make([]int64, len(likes))
	for i, lv := range likes {
		likeIDs[i] = lv.id
	}

	return &UserProfile{
		Vector:       profile,
		Clusters:     buildClusters(likes, skipVecs),
		LikeImageIDs: likeIDs,
	}, nil
}

// buildClusters はいいねを系統に分割し、系統ごとの好みベクトルとシェアを算出する。
// スキップ（Rocchio負例）は全系統に共通で適用する。
func buildClusters(likes []weightedVec, skipVecs [][]float32) []ProfileCluster {
	groups := clusterLikes(likes)

	var totalW float64
	for _, lv := range likes {
		totalW += lv.w
	}

	clusters := make([]ProfileCluster, 0, len(groups))
	for _, g := range groups {
		vec := computeProfileVector(g, skipVecs)
		if vec == nil {
			continue
		}
		var w float64
		ids := make([]int64, len(g))
		for i, lv := range g {
			w += lv.w
			ids[i] = lv.id
		}
		share := 1.0
		if totalW > 0 {
			share = w / totalW
		}
		clusters = append(clusters, ProfileCluster{Vector: vec, Share: share, LikeIDs: ids})
	}
	return clusters
}

// embedDim はCLIP ViT-B/32 の埋め込み次元数。
const embedDim = 512

// computeProfileVector は重み付き平均 + Rocchio(β=0.2) + L2正規化の純粋計算部。
// 有効ないいねが無い場合は nil を返す。
func computeProfileVector(likes []weightedVec, skipVecs [][]float32) []float32 {
	const dim = embedDim
	profile := make([]float32, dim)
	var totalW float64

	// 重み付き平均（いいね）
	for _, lv := range likes {
		if len(lv.vec) != dim {
			continue
		}
		for i := 0; i < dim; i++ {
			profile[i] += float32(lv.w) * lv.vec[i]
		}
		totalW += lv.w
	}
	if totalW == 0 {
		return nil
	}
	for i := range profile {
		profile[i] /= float32(totalW)
	}

	// Rocchio: スキップの平均を β=0.2 で差し引く
	if len(skipVecs) > 0 {
		const beta = 0.2
		skipMean := make([]float32, dim)
		for _, sv := range skipVecs {
			if len(sv) != dim {
				continue
			}
			for i := 0; i < dim; i++ {
				skipMean[i] += sv[i]
			}
		}
		n := float32(len(skipVecs))
		for i := range skipMean {
			skipMean[i] /= n
		}
		for i := range profile {
			profile[i] -= beta * skipMean[i]
		}
	}

	// L2 正規化（cosine 検索のため）
	return l2normalize(profile)
}

func l2normalize(v []float32) []float32 {
	var norm float64
	for _, x := range v {
		norm += float64(x) * float64(x)
	}
	norm = math.Sqrt(norm)
	if norm == 0 {
		return v
	}
	out := make([]float32, len(v))
	for i, x := range v {
		out[i] = float32(float64(x) / norm)
	}
	return out
}
