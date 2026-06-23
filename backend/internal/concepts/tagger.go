package concepts

import (
	"context"
	"log/slog"
	"math"
	"sort"
	"sync"
	"time"

	"palettevein/internal/clip"
)

// Tag は概念タグ1件。En は英語句（CLIP 検索用）、Ja は日本語ラベル（表示用）。
type Tag struct {
	En     string  `json:"en"`
	Ja     string  `json:"ja"`
	Weight float64 `json:"weight"` // [0,1] セット内の相対的な強度（pill サイズ等に使う）
}

// Tagger は好みベクトル → 概念タグの翻訳器。
// Warmup 完了前は Top/Reason が nil を返す（CLIP 未起動時も安全）。
type Tagger struct {
	clip   *clip.Client
	mu     sync.RWMutex
	embeds [][]float32 // 各 Vocabulary エントリの centered+normalized CLIP ベクトル
	mean   []float32   // 全タグ正規化ベクトルの平均（クエリのセンタリング用）
	ready  bool
}

// NewTagger は新しい Tagger を生成する。Warmup は別途 goroutine で呼ぶ。
func NewTagger(c *clip.Client) *Tagger {
	return &Tagger{clip: c}
}

// Warmup は全語彙を EmbedText で埋め込みキャッシュする。
// CLIP が未起動の場合は指数バックオフでリトライする（最大 2 分間隔）。
func (t *Tagger) Warmup(ctx context.Context) {
	backoff := 5 * time.Second
	for {
		if err := t.warmupOnce(ctx); err != nil {
			slog.Warn("tagger: warmup failed, retrying", "error", err, "backoff", backoff)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < 2*time.Minute {
				backoff *= 2
			}
			continue
		}
		slog.Info("tagger: warmup done", "concepts", len(Vocabulary))
		return
	}
}

func (t *Tagger) warmupOnce(ctx context.Context) error {
	raw := make([][]float32, len(Vocabulary))
	for i, c := range Vocabulary {
		vec, err := t.clip.EmbedText(ctx, c.En)
		if err != nil {
			return err
		}
		raw[i] = l2norm(vec)
	}

	if len(raw) == 0 || len(raw[0]) == 0 {
		return nil
	}
	dim := len(raw[0])

	// 平均ベクトルを算出（万人共通の方向を除いてユーザー固有の特徴を際立たせる）
	mean := make([]float32, dim)
	for _, v := range raw {
		for j, x := range v {
			mean[j] += x / float32(len(raw))
		}
	}

	// 各タグを mean で中心化してから再正規化
	centered := make([][]float32, len(raw))
	for i, v := range raw {
		c := make([]float32, dim)
		for j := range c {
			c[j] = v[j] - mean[j]
		}
		centered[i] = l2norm(c)
	}

	t.mu.Lock()
	t.embeds = centered
	t.mean = mean
	t.ready = true
	t.mu.Unlock()
	return nil
}

// Ready はウォームアップ完了を返す。
func (t *Tagger) Ready() bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.ready
}

// Top はユーザーの好みベクトルに近い上位 k 件の概念タグを返す。
// ウォームアップ未完 or vec が空の場合は nil。
func (t *Tagger) Top(vec []float32, k int) []Tag {
	t.mu.RLock()
	defer t.mu.RUnlock()
	if !t.ready || len(vec) == 0 {
		return nil
	}
	cv := l2norm(vecSub(vec, t.mean))
	scores := t.dotScores(cv)
	return buildTags(scores, k)
}

// Reason は「画像とプロフィール両方に合致する概念」上位 k 件を返す。
// min(img_score, prof_score) 方式で「この画像があなたのどの好みに合うか」を表現する。
func (t *Tagger) Reason(imgVec, profVec []float32, k int) []Tag {
	t.mu.RLock()
	defer t.mu.RUnlock()
	if !t.ready || len(imgVec) == 0 || len(profVec) == 0 {
		return nil
	}
	imgC := l2norm(vecSub(imgVec, t.mean))
	profC := l2norm(vecSub(profVec, t.mean))

	scores := make([]float64, len(t.embeds))
	for i, e := range t.embeds {
		si := float64(dotProd(imgC, e))
		sp := float64(dotProd(profC, e))
		// 画像にも好みにも当てはまる概念 = 両方でスコアが高い最小値
		if si < sp {
			scores[i] = si
		} else {
			scores[i] = sp
		}
	}
	return buildTags(scores, k)
}

func (t *Tagger) dotScores(cv []float32) []float64 {
	scores := make([]float64, len(t.embeds))
	for i, e := range t.embeds {
		scores[i] = float64(dotProd(cv, e))
	}
	return scores
}

// --- 内部ヘルパー ---

type scoredIdx struct {
	idx   int
	score float64
}

func buildTags(scores []float64, k int) []Tag {
	ss := make([]scoredIdx, len(scores))
	for i, s := range scores {
		ss[i] = scoredIdx{i, s}
	}
	sort.Slice(ss, func(i, j int) bool { return ss[i].score > ss[j].score })

	if k > len(ss) {
		k = len(ss)
	}
	// スコアが正（同じ半球上）の概念のみ残す
	for k > 0 && ss[k-1].score <= 0 {
		k--
	}
	if k == 0 {
		return nil
	}
	maxScore := ss[0].score
	if maxScore <= 0 {
		return nil
	}

	tags := make([]Tag, k)
	for i, s := range ss[:k] {
		c := Vocabulary[s.idx]
		tags[i] = Tag{
			En:     c.En,
			Ja:     c.Ja,
			Weight: math.Max(0, s.score/maxScore),
		}
	}
	return tags
}

// l2norm は L2 正規化した新しいスライスを返す。ゼロベクトルはそのまま返す。
func l2norm(v []float32) []float32 {
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	if sum == 0 {
		out := make([]float32, len(v))
		copy(out, v)
		return out
	}
	inv := float32(1 / math.Sqrt(sum))
	out := make([]float32, len(v))
	for i, x := range v {
		out[i] = x * inv
	}
	return out
}

// vecSub は a - b の新しいスライスを返す。b が短い場合は a の要素をそのまま使う。
func vecSub(a, b []float32) []float32 {
	out := make([]float32, len(a))
	for i := range out {
		if i < len(b) {
			out[i] = a[i] - b[i]
		} else {
			out[i] = a[i]
		}
	}
	return out
}

// dotProd は a と b の内積を返す。L2 正規化済みベクトルに使う。
func dotProd(a, b []float32) float32 {
	var s float32
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	for i := 0; i < n; i++ {
		s += a[i] * b[i]
	}
	return s
}
