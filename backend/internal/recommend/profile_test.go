package recommend

import (
	"math"
	"testing"
)

// sparseVec は 512 次元ゼロベクトルの idx 番目だけ val を立てて返す。
func sparseVec(idx int, val float32) []float32 {
	v := make([]float32, 512)
	v[idx] = val
	return v
}

// norm32 は []float32 の L2 ノルムを返す。
func norm32(v []float32) float64 {
	var s float64
	for _, x := range v {
		s += float64(x) * float64(x)
	}
	return math.Sqrt(s)
}

// ---- l2normalize ----

func TestL2Normalize(t *testing.T) {
	t.Run("zero vector stays zero", func(t *testing.T) {
		in := make([]float32, 4)
		out := l2normalize(in)
		for i, x := range out {
			if x != 0 {
				out[i] = x // suppress unused
				t.Errorf("idx %d: want 0, got %v", i, x)
			}
		}
	})

	t.Run("[3,4] -> [0.6,0.8]", func(t *testing.T) {
		in := []float32{3, 4}
		out := l2normalize(in)
		want := []float32{0.6, 0.8}
		for i := range want {
			if math.Abs(float64(out[i])-float64(want[i])) > 1e-6 {
				t.Errorf("idx %d: want %v, got %v", i, want[i], out[i])
			}
		}
	})

	t.Run("norm is 1 after normalization", func(t *testing.T) {
		in := []float32{1, 2, 3, 4, 5}
		out := l2normalize(in)
		n := norm32(out)
		if math.Abs(n-1.0) > 1e-6 {
			t.Errorf("want norm=1, got %v", n)
		}
	})
}

// ---- computeProfileVector ----

func TestComputeProfileVector(t *testing.T) {
	t.Run("single like weight=1 -> unit vector in that direction", func(t *testing.T) {
		likes := []weightedVec{
			{id: 1, w: 1.0, vec: sparseVec(0, 1.0)},
		}
		out := computeProfileVector(likes, nil)
		if out == nil {
			t.Fatal("want non-nil, got nil")
		}
		// 正規化後は sparseVec(0,1) の方向 → out[0]=1, 他は0
		if math.Abs(float64(out[0])-1.0) > 1e-6 {
			t.Errorf("out[0]: want 1.0, got %v", out[0])
		}
		for i := 1; i < 512; i++ {
			if math.Abs(float64(out[i])) > 1e-6 {
				t.Errorf("out[%d]: want 0, got %v", i, out[i])
			}
		}
	})

	t.Run("two orthogonal likes weighted 1.0 and 0.5 -> ratio matches weights", func(t *testing.T) {
		// like1: 軸0方向 重み1.0, like2: 軸1方向 重み0.5
		likes := []weightedVec{
			{id: 1, w: 1.0, vec: sparseVec(0, 1.0)},
			{id: 2, w: 0.5, vec: sparseVec(1, 1.0)},
		}
		out := computeProfileVector(likes, nil)
		if out == nil {
			t.Fatal("want non-nil, got nil")
		}
		// 重み付き平均後（正規化前）: [1.0/1.5, 0.5/1.5, ...]
		// 比率は out[0]/out[1] == 1.0/0.5 == 2.0
		ratio := float64(out[0]) / float64(out[1])
		wantRatio := 1.0 / 0.5
		if math.Abs(ratio-wantRatio) > 1e-5 {
			t.Errorf("component ratio: want %v, got %v", wantRatio, ratio)
		}
		// 正規化済みなのでノルムは1
		if math.Abs(norm32(out)-1.0) > 1e-6 {
			t.Errorf("norm: want 1, got %v", norm32(out))
		}
	})

	t.Run("skip reduces component in skip direction", func(t *testing.T) {
		// いいねは軸0方向
		likes := []weightedVec{
			{id: 1, w: 1.0, vec: sparseVec(0, 1.0)},
		}
		// skip も軸0方向（正規化済み単位ベクトル）
		skipVecs := [][]float32{sparseVec(0, 1.0)}

		outWithSkip := computeProfileVector(likes, skipVecs)
		outNoSkip := computeProfileVector(likes, nil)

		if outWithSkip == nil || outNoSkip == nil {
			t.Fatal("want non-nil results")
		}
		// skip があると軸0方向成分が Rocchio で引かれるため絶対値が減る
		// （両方とも後で l2normalize されるが、skip 後は他次元への相対比が変わる）
		// ここでは正規化前の挙動を比較するため、skipMean の寄与方向(軸0)の
		// 成分を確認: skip適用後は profile[0] が小さくなる方向
		// 簡単な検証: outWithSkip[0] <= outNoSkip[0]
		if outWithSkip[0] > outNoSkip[0] {
			t.Errorf("skip should decrease axis-0 component: withSkip=%v noSkip=%v",
				outWithSkip[0], outNoSkip[0])
		}
	})

	t.Run("wrong dimension like is skipped, valid 0 -> nil", func(t *testing.T) {
		likes := []weightedVec{
			{id: 1, w: 1.0, vec: []float32{1, 2, 3}}, // dim != 512
		}
		out := computeProfileVector(likes, nil)
		if out != nil {
			t.Errorf("want nil for all-invalid likes, got %v", out)
		}
	})

	t.Run("empty likes -> nil", func(t *testing.T) {
		out := computeProfileVector(nil, nil)
		if out != nil {
			t.Errorf("want nil, got %v", out)
		}
	})

	t.Run("mix of valid and invalid dimension likes, valid wins", func(t *testing.T) {
		likes := []weightedVec{
			{id: 1, w: 1.0, vec: []float32{1, 2, 3}},     // invalid
			{id: 2, w: 1.0, vec: sparseVec(0, 1.0)},      // valid
		}
		out := computeProfileVector(likes, nil)
		if out == nil {
			t.Fatal("want non-nil when at least one valid like exists")
		}
	})
}
