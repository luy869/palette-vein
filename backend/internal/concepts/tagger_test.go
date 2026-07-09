package concepts

import "testing"

// newTestTagger は語彙と同数の直交基底をタグ埋め込みに使う Tagger を作る。
// tag i のスコアは、そのままベクトルの i 番目の成分になる。
func newTestTagger() *Tagger {
	n := len(Vocabulary)
	embeds := make([][]float32, n)
	for i := range embeds {
		v := make([]float32, n)
		v[i] = 1
		embeds[i] = v
	}
	return &Tagger{embeds: embeds, mean: make([]float32, n), ready: true}
}

// Reason は画像ごとに違うタグを返さなければならない。
// min(img, prof) 方式ではプロフィール側スコアが上限になり、
// 画像によらず同じタグが並んでしまっていた（回帰防止）。
func TestReasonIsImageSpecific(t *testing.T) {
	tg := newTestTagger()
	n := len(Vocabulary)

	prof := make([]float32, n)
	prof[0], prof[1] = 0.1, 0.1 // どちらも好むが、スコアは小さい（平均ベクトルの希釈を模す）

	imgA := make([]float32, n)
	imgA[0], imgA[1] = 0.2, 0.9 // tag1 を強く表す画像

	imgB := make([]float32, n)
	imgB[0], imgB[1] = 0.9, 0.2 // tag0 を強く表す画像

	a := tg.Reason(imgA, prof, 1)
	b := tg.Reason(imgB, prof, 1)

	if len(a) != 1 || len(b) != 1 {
		t.Fatalf("expected 1 tag each, got %d and %d", len(a), len(b))
	}
	if a[0].En != Vocabulary[1].En {
		t.Errorf("imgA: want %q, got %q", Vocabulary[1].En, a[0].En)
	}
	if b[0].En != Vocabulary[0].En {
		t.Errorf("imgB: want %q, got %q", Vocabulary[0].En, b[0].En)
	}
	if a[0].En == b[0].En {
		t.Error("Reason returned the same tag for two different images")
	}
}

// 好みと反対方向（プロフィール側スコアが非正）の概念は、
// 画像がどれだけ強く表していても推薦理由にしてはならない。
func TestReasonExcludesConceptsProfileDislikes(t *testing.T) {
	tg := newTestTagger()
	n := len(Vocabulary)

	prof := make([]float32, n)
	prof[0] = 0.1  // 好む
	prof[2] = -0.5 // 好まない

	img := make([]float32, n)
	img[0] = 0.1
	img[2] = 0.99 // 画像は tag2 を圧倒的に強く表す

	tags := tg.Reason(img, prof, 3)
	for _, tag := range tags {
		if tag.En == Vocabulary[2].En {
			t.Fatalf("Reason returned %q, a concept the profile scores negatively", tag.En)
		}
	}
	if len(tags) == 0 || tags[0].En != Vocabulary[0].En {
		t.Errorf("want top tag %q, got %v", Vocabulary[0].En, tags)
	}
}

// Warmup 未完了なら nil（CLIP 未起動時に落ちない）。
func TestReasonNotReady(t *testing.T) {
	tg := &Tagger{}
	if got := tg.Reason([]float32{1}, []float32{1}, 3); got != nil {
		t.Errorf("want nil before warmup, got %v", got)
	}
}
