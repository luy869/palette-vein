package recommend

import (
	"math"
	"sort"
	"testing"
)

// ---- cosineSim ----

func TestCosineSim(t *testing.T) {
	t.Run("identical unit vectors -> 1.0", func(t *testing.T) {
		a := sparseVec(0, 1.0)
		b := sparseVec(0, 1.0)
		got := cosineSim(a, b)
		if math.Abs(float64(got)-1.0) > 1e-6 {
			t.Errorf("want 1.0, got %v", got)
		}
	})

	t.Run("orthogonal unit vectors -> 0.0", func(t *testing.T) {
		a := sparseVec(0, 1.0)
		b := sparseVec(1, 1.0)
		got := cosineSim(a, b)
		if math.Abs(float64(got)) > 1e-6 {
			t.Errorf("want 0.0, got %v", got)
		}
	})

	t.Run("length mismatch: a longer -> uses shorter length, no panic", func(t *testing.T) {
		a := []float32{1, 0, 0, 0} // len=4
		b := []float32{1, 0}       // len=2
		// cosineSim は i < len(b) で break するので [1*1 + 0*0] = 1
		got := cosineSim(a, b)
		if math.Abs(float64(got)-1.0) > 1e-6 {
			t.Errorf("want 1.0 (only first 2 dims used), got %v", got)
		}
	})
}

// ---- topNReasons ----

func TestTopNReasons(t *testing.T) {
	t.Run("returns top 2 by cosine similarity from 3 likeVecs", func(t *testing.T) {
		// recVec は軸0方向
		recVec := sparseVec(0, 1.0)
		likeVecs := map[int64][]float32{
			10: sparseVec(0, 1.0),  // sim=1.0 (最高)
			20: sparseVec(1, 1.0),  // sim=0.0 (最低)
			30: sparseVec(0, 0.9),  // sim=0.9 (2番目) ← 0.9はunit vectorじゃないが cosineSim は dot のみ
		}
		usedCounts := map[int64]int{}
		ids := topNReasons(recVec, likeVecs, 2, usedCounts)
		if len(ids) != 2 {
			t.Fatalf("want 2 ids, got %d", len(ids))
		}
		// ids[0] は id=10 (sim=1.0), ids[1] は id=30 (sim=0.9) のはず
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		if ids[0] != 10 || ids[1] != 30 {
			t.Errorf("want [10 30], got %v", ids)
		}
	})

	t.Run("usedCounts penalty: overused id loses to slightly lower similarity", func(t *testing.T) {
		// recVec は軸0方向
		recVec := sparseVec(0, 1.0)
		// id=10: sim=1.0 だが usedCounts=2 → penalized score = 1.0/3
		// id=20: sim=0.8 で unused → score = 0.8/1
		likeVecs := map[int64][]float32{
			10: sparseVec(0, 1.0),
			20: sparseVec(0, 0.8),
		}
		usedCounts := map[int64]int{10: 2}
		ids := topNReasons(recVec, likeVecs, 1, usedCounts)
		if len(ids) != 1 {
			t.Fatalf("want 1 id, got %d", len(ids))
		}
		if ids[0] != 20 {
			t.Errorf("want id=20 (higher adjusted score), got id=%d", ids[0])
		}
	})

	t.Run("n > len(likeVecs) -> returns all", func(t *testing.T) {
		recVec := sparseVec(0, 1.0)
		likeVecs := map[int64][]float32{
			1: sparseVec(0, 1.0),
			2: sparseVec(1, 1.0),
		}
		ids := topNReasons(recVec, likeVecs, 5, map[int64]int{})
		if len(ids) != 2 {
			t.Errorf("want 2 (all), got %d", len(ids))
		}
	})

	t.Run("empty likeVecs -> empty slice", func(t *testing.T) {
		recVec := sparseVec(0, 1.0)
		ids := topNReasons(recVec, map[int64][]float32{}, 2, map[int64]int{})
		if len(ids) != 0 {
			t.Errorf("want empty, got %v", ids)
		}
	})
}
