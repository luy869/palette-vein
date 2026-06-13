package recommend

import (
	"testing"

	"palettevein/internal/models"
)

// makeVec は dir 軸方向に強い単位ベクトルを作る（jitter で軸ごとに微小ノイズ）。
func makeVec(dir int, jitter float32) []float32 {
	v := make([]float32, embedDim)
	v[dir] = 1.0
	v[(dir+1)%embedDim] = jitter
	return l2normalize(v)
}

func makeLikes(n int, dir int, startID int64) []weightedVec {
	likes := make([]weightedVec, n)
	for i := 0; i < n; i++ {
		likes[i] = weightedVec{
			id:  startID + int64(i),
			w:   1.0,
			vec: makeVec(dir, float32(i)*0.01),
		}
	}
	return likes
}

func TestClusterLikesBelowThreshold(t *testing.T) {
	likes := makeLikes(10, 0, 1)
	got := clusterLikes(likes)
	if len(got) != 1 {
		t.Fatalf("likes < %d should stay 1 cluster, got %d", clusterMinLikes, len(got))
	}
	if len(got[0]) != 10 {
		t.Fatalf("cluster should contain all 10 likes, got %d", len(got[0]))
	}
}

func TestClusterLikesSingleTightCluster(t *testing.T) {
	// 全部同じ方向 → k=2 にしても改善しないので 1 クラスタのまま
	likes := makeLikes(40, 0, 1)
	got := clusterLikes(likes)
	if len(got) != 1 {
		t.Fatalf("tight cluster should not split, got %d clusters", len(got))
	}
}

func TestClusterLikesTwoSeparatedGroups(t *testing.T) {
	// 直交する2方向（次元0と次元100）→ 2クラスタに分かれるはず
	likes := append(makeLikes(20, 0, 1), makeLikes(20, 100, 100)...)
	got := clusterLikes(likes)
	if len(got) != 2 {
		t.Fatalf("two orthogonal groups should split into 2 clusters, got %d", len(got))
	}
	// 各クラスタが片方の系統のみで構成されているか（IDレンジで判定）
	for _, cl := range got {
		var lo, hi int
		for _, lv := range cl {
			if lv.id < 100 {
				lo++
			} else {
				hi++
			}
		}
		if lo > 0 && hi > 0 {
			t.Errorf("cluster mixes both groups: lo=%d hi=%d", lo, hi)
		}
	}
}

func TestClusterLikesDeterministic(t *testing.T) {
	likes := append(makeLikes(20, 0, 1), makeLikes(20, 100, 100)...)
	a := clusterLikes(likes)
	b := clusterLikes(likes)
	if len(a) != len(b) {
		t.Fatalf("non-deterministic cluster count: %d vs %d", len(a), len(b))
	}
	for i := range a {
		if len(a[i]) != len(b[i]) {
			t.Errorf("cluster %d size differs: %d vs %d", i, len(a[i]), len(b[i]))
		}
	}
}

func TestBuildClustersShares(t *testing.T) {
	// 30:10 の2系統 → シェアが 0.75 / 0.25 付近になる
	likes := append(makeLikes(30, 0, 1), makeLikes(10, 100, 100)...)
	clusters := buildClusters(likes, nil)
	if len(clusters) != 2 {
		t.Fatalf("expected 2 clusters, got %d", len(clusters))
	}
	var totalShare float64
	for _, c := range clusters {
		totalShare += c.Share
		if len(c.Vector) != embedDim {
			t.Errorf("cluster vector dim = %d, want %d", len(c.Vector), embedDim)
		}
	}
	if totalShare < 0.99 || totalShare > 1.01 {
		t.Errorf("shares should sum to 1.0, got %f", totalShare)
	}
}

func TestAllocateCounts(t *testing.T) {
	tests := []struct {
		name   string
		shares []float64
		total  int
		want   []int
	}{
		{"single", []float64{1.0}, 19, []int{19}},
		{"even split", []float64{0.5, 0.5}, 20, []int{10, 10}},
		{"70-30", []float64{0.7, 0.3}, 19, []int{13, 6}},
		{"small share gets min 1", []float64{0.95, 0.05}, 19, []int{18, 1}},
		{"three way", []float64{0.5, 0.3, 0.2}, 19, []int{9, 6, 4}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := allocateCounts(tt.shares, tt.total)
			sum := 0
			for i, g := range got {
				sum += g
				if g != tt.want[i] {
					t.Errorf("allocateCounts(%v, %d)[%d] = %d, want %d", tt.shares, tt.total, i, g, tt.want[i])
				}
			}
			if sum != tt.total {
				t.Errorf("sum = %d, want %d", sum, tt.total)
			}
		})
	}
}

func mkResult(id int64, score float32) Result {
	return Result{Image: models.Image{ID: id}, Score: score, Source: "similar"}
}

func TestMergeClusterCandidates(t *testing.T) {
	t.Run("dedup across clusters", func(t *testing.T) {
		perCluster := [][]Result{
			{mkResult(1, 0.9), mkResult(2, 0.8)},
			{mkResult(1, 0.85), mkResult(3, 0.7)}, // ID=1 が重複
		}
		got := mergeClusterCandidates(perCluster, []int{2, 2}, 4)
		if len(got) != 3 {
			t.Fatalf("expected 3 unique results, got %d", len(got))
		}
		seen := map[int64]bool{}
		for _, r := range got {
			if seen[r.Image.ID] {
				t.Errorf("duplicate ID %d in output", r.Image.ID)
			}
			seen[r.Image.ID] = true
		}
	})

	t.Run("backfill from other cluster", func(t *testing.T) {
		perCluster := [][]Result{
			{mkResult(1, 0.9)}, // 配分2だが1件しかない
			{mkResult(2, 0.8), mkResult(3, 0.7), mkResult(4, 0.6)},
		}
		got := mergeClusterCandidates(perCluster, []int{2, 2}, 4)
		if len(got) != 4 {
			t.Fatalf("expected backfill to 4, got %d", len(got))
		}
	})

	t.Run("respects allocation", func(t *testing.T) {
		perCluster := [][]Result{
			{mkResult(1, 0.9), mkResult(2, 0.89), mkResult(3, 0.88)},
			{mkResult(4, 0.5), mkResult(5, 0.49)},
		}
		got := mergeClusterCandidates(perCluster, []int{2, 1}, 3)
		if len(got) != 3 {
			t.Fatalf("expected 3, got %d", len(got))
		}
		// クラスタ2のトップ（ID=4）が低スコアでも配分枠で必ず入る
		found := false
		for _, r := range got {
			if r.Image.ID == 4 {
				found = true
			}
		}
		if !found {
			t.Error("cluster 2's top candidate should be included by allocation")
		}
	})
}

func TestLeftoverCandidates(t *testing.T) {
	perCluster := [][]Result{
		{mkResult(1, 0.9), mkResult(2, 0.8), mkResult(3, 0.7)},
	}
	items := []Result{mkResult(1, 0.9)}
	got := leftoverCandidates(perCluster, items, 1)
	if len(got) != 1 {
		t.Fatalf("expected 1 leftover, got %d", len(got))
	}
	if got[0].Image.ID != 2 {
		t.Errorf("leftover should be highest-score unused (ID=2), got ID=%d", got[0].Image.ID)
	}
}
