package api

import (
	"log/slog"
	"net/http"

	"palettevein/internal/concepts"
)

// handleProfileTags は GET /api/profile/tags を処理する。
// ユーザーの好みベクトルを CLIP 概念タグに翻訳して返す。
func (s *Server) handleProfileTags(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(ctxUserID).(int64)

	// タガーがまだウォームアップ中の場合
	if !s.tagger.Ready() {
		writeJSON(w, http.StatusOK, map[string]any{
			"warming_up": true,
			"tags":       []concepts.Tag{},
			"clusters":   []any{},
		})
		return
	}

	profile, err := s.profileCache.Get(r.Context(), s.db, userID)
	if err != nil {
		slog.Error("profile tags: cache get error", "error", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	// コールドスタート（いいねが不足）
	if profile == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"cold_start": true,
			"tags":       []concepts.Tag{},
			"clusters":   []any{},
		})
		return
	}

	// 全体の好みに近い上位タグ
	tags := s.tagger.Top(profile.Vector, 8)
	if tags == nil {
		tags = []concepts.Tag{}
	}

	// クラスタが複数ある場合のみ系統別タグを返す
	type clusterTags struct {
		Share float64        `json:"share"`
		Tags  []concepts.Tag `json:"tags"`
	}
	var clusters []clusterTags
	if len(profile.Clusters) > 1 {
		clusters = make([]clusterTags, 0, len(profile.Clusters))
		for _, cl := range profile.Clusters {
			ct := s.tagger.Top(cl.Vector, 6)
			if ct == nil {
				ct = []concepts.Tag{}
			}
			clusters = append(clusters, clusterTags{Share: cl.Share, Tags: ct})
		}
	}
	if clusters == nil {
		clusters = []clusterTags{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"tags":     tags,
		"clusters": clusters,
	})
}
