package api

import (
	"log"
	"net/http"

	"palettevein/internal/recommend"
)

func (s *Server) handleGetRecommend(w http.ResponseWriter, r *http.Request) {
	const userID int64 = 1

	profile, err := recommend.ComputeUserProfile(r.Context(), s.db, userID)
	if err != nil {
		log.Printf("recommend: profile error: %v", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	var resp *recommend.Response
	if profile == nil {
		resp, err = recommend.SearchToplist(r.Context(), s.db, userID)
	} else {
		resp, err = recommend.Search(r.Context(), s.db, userID, profile)
	}
	if err != nil {
		log.Printf("recommend: search error: %v", err)
		http.Error(w, "recommend error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, resp)
}
