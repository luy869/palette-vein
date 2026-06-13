package api

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"palettevein/internal/recommend"
)

func (s *Server) handleGetRecommend(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(ctxUserID).(int64)

	excludeIDs := []int64{}
	if ex := r.URL.Query().Get("exclude"); ex != "" {
		for _, p := range strings.Split(ex, ",") {
			if n, err := strconv.ParseInt(strings.TrimSpace(p), 10, 64); err == nil {
				excludeIDs = append(excludeIDs, n)
			}
		}
	}

	profile, err := s.profileCache.Get(r.Context(), s.db, userID)
	if err != nil {
		slog.Error("recommend: profile error", "error", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	var resp *recommend.Response
	if profile == nil {
		resp, err = recommend.SearchToplist(r.Context(), s.db, userID, excludeIDs)
	} else {
		resp, err = recommend.Search(r.Context(), s.db, userID, profile, excludeIDs)
	}
	if err != nil {
		slog.Error("recommend: search error", "error", err)
		http.Error(w, "recommend error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, resp)
}
