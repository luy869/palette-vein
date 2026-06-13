package recommend

// 好みの複峰性対応: いいねが複数の系統（例: サイバーパンクと自然風景）に
// 分かれている場合、単一の平均ベクトルは「どちらでもない中間」を指してしまう。
// いいねが一定数を超えたらスフェリカルk-meansで系統に分割し、系統ごとに検索する。

const (
	clusterMinLikes  = 30   // クラスタリングを開始するいいね数
	maxClusters      = 3    // 最大クラスタ数
	minClusterSize   = 5    // クラスタとして認める最小メンバー数
	clusterMinGain   = 0.03 // kを増やすために必要な平均類似度の最小改善（エルボー法）
	kmeansIterations = 20
)

// clusterLikes はいいねベクトル群を1〜maxClusters個のクラスタに分割する。
// 決定的（乱数なし）: maximin法で初期セントロイドを選択するため同入力なら同出力。
func clusterLikes(likes []weightedVec) [][]weightedVec {
	// 次元不正を除外
	valid := make([]weightedVec, 0, len(likes))
	for _, lv := range likes {
		if len(lv.vec) == embedDim {
			valid = append(valid, lv)
		}
	}
	if len(valid) < clusterMinLikes {
		return [][]weightedVec{valid}
	}

	best := [][]weightedVec{valid}
	bestQuality := clusterQuality(best)

	for k := 2; k <= maxClusters; k++ {
		clusters, ok := kmeansCluster(valid, k)
		if !ok {
			break // このkで有効なクラスタが作れなければ以降のkも無理
		}
		q := clusterQuality(clusters)
		if q-bestQuality < clusterMinGain {
			break // 改善が小さい → 1つ前のkを採用
		}
		best = clusters
		bestQuality = q
	}
	return best
}

// kmeansCluster はスフェリカルk-means。全クラスタが minClusterSize を満たさなければ ok=false。
func kmeansCluster(points []weightedVec, k int) ([][]weightedVec, bool) {
	centroids := initCentroidsMaximin(points, k)

	assign := make([]int, len(points))
	for iter := 0; iter < kmeansIterations; iter++ {
		changed := false
		for i, p := range points {
			bestC, bestSim := 0, float32(-2)
			for c := range centroids {
				if sim := cosineSim(p.vec, centroids[c]); sim > bestSim {
					bestC, bestSim = c, sim
				}
			}
			if assign[i] != bestC {
				assign[i] = bestC
				changed = true
			}
		}
		if !changed && iter > 0 {
			break
		}
		// 重み付き平均でセントロイド更新
		for c := range centroids {
			sum := make([]float32, embedDim)
			var total float64
			for i, p := range points {
				if assign[i] != c {
					continue
				}
				for d := 0; d < embedDim; d++ {
					sum[d] += float32(p.w) * p.vec[d]
				}
				total += p.w
			}
			if total == 0 {
				continue // 空クラスタはセントロイド据え置き（最終チェックで弾かれる）
			}
			centroids[c] = l2normalize(sum)
		}
	}

	clusters := make([][]weightedVec, k)
	for i, p := range points {
		clusters[assign[i]] = append(clusters[assign[i]], p)
	}
	for _, cl := range clusters {
		if len(cl) < minClusterSize {
			return nil, false
		}
	}
	return clusters, true
}

// initCentroidsMaximin は最初のセントロイドを最大重みの点とし、
// 以降は既存セントロイドとの最大類似度が最小の点（最も遠い点）を選ぶ。
func initCentroidsMaximin(points []weightedVec, k int) [][]float32 {
	first := 0
	for i := range points {
		if points[i].w > points[first].w {
			first = i
		}
	}
	centroids := [][]float32{points[first].vec}

	for len(centroids) < k {
		farthest, farthestSim := -1, float32(2)
		for i, p := range points {
			// 既存セントロイドとの最大類似度（=最も近いセントロイドへの近さ）
			maxSim := float32(-2)
			for _, c := range centroids {
				if sim := cosineSim(p.vec, c); sim > maxSim {
					maxSim = sim
				}
			}
			if maxSim < farthestSim {
				farthest, farthestSim = i, maxSim
			}
		}
		centroids = append(centroids, points[farthest].vec)
	}
	return centroids
}

// clusterQuality は各点と所属クラスタの重み付き平均ベクトルとの平均コサイン類似度。
func clusterQuality(clusters [][]weightedVec) float64 {
	var totalSim float64
	var n int
	for _, cl := range clusters {
		if len(cl) == 0 {
			continue
		}
		sum := make([]float32, embedDim)
		var totalW float64
		for _, p := range cl {
			for d := 0; d < embedDim; d++ {
				sum[d] += float32(p.w) * p.vec[d]
			}
			totalW += p.w
		}
		if totalW == 0 {
			continue
		}
		centroid := l2normalize(sum)
		for _, p := range cl {
			totalSim += float64(cosineSim(p.vec, centroid))
			n++
		}
	}
	if n == 0 {
		return 0
	}
	return totalSim / float64(n)
}

// allocateCounts は total 件をシェアに比例配分する（最大剰余法）。各クラスタ最低1件。
func allocateCounts(shares []float64, total int) []int {
	k := len(shares)
	if k == 0 {
		return nil
	}
	if total < k {
		total = k // 各クラスタ最低1件は保証
	}
	counts := make([]int, k)
	type rem struct {
		idx  int
		frac float64
	}
	rems := make([]rem, k)
	used := 0
	for i, s := range shares {
		exact := s * float64(total)
		counts[i] = int(exact)
		if counts[i] < 1 {
			counts[i] = 1
		}
		used += counts[i]
		rems[i] = rem{idx: i, frac: exact - float64(int(exact))}
	}
	// 端数の大きい順に残りを配る（超過時は端数の小さい順に削る）
	for used < total {
		best := 0
		for i := 1; i < k; i++ {
			if rems[i].frac > rems[best].frac {
				best = i
			}
		}
		counts[rems[best].idx]++
		rems[best].frac = -1
		used++
	}
	for used > total {
		worst := -1
		for i := 0; i < k; i++ {
			if counts[rems[i].idx] > 1 && (worst == -1 || rems[i].frac < rems[worst].frac) {
				worst = i
			}
		}
		if worst == -1 {
			break
		}
		counts[rems[worst].idx]--
		rems[worst].frac = 2
		used--
	}
	return counts
}
